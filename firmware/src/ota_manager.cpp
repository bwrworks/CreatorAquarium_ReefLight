#include "ota_manager.h"
#include <WiFiClientSecure.h>
#include <mbedtls/sha256.h>
#include "storage_manager.h"
#include "schedule_engine.h"
#include "ledc_driver.h"

OtaManager otaManager;

OtaManager::OtaManager()
    : inProgress(false),
      healthConfirmed(false),
      needsVerification(false) {}

void OtaManager::begin() {
    const esp_partition_t* running = esp_ota_get_running_partition();
    esp_ota_img_states_t ota_state;
    if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
        if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
            Serial.println("[OTA] Current partition is PENDING_VERIFY. Monitoring local health...");
            needsVerification = true;
        } else {
            healthConfirmed = true;
        }
    } else {
        healthConfirmed = true;
    }
}

// =========================================================================
// Bug #1 Fix: Purely Local Health Confirmation (Decoupled from Cloud)
// =========================================================================
void OtaManager::checkAndConfirmLocalHealth() {
    if (healthConfirmed || !needsVerification) return;

    // Criteria: local peripherals initialized, LittleFS mounted, and schedule engine ticked >= 3 times
    if (ledcDriver.isInitialized() && storageManager.isMounted() && scheduleEngine.getTickCount() >= 3) {
        esp_err_t err = esp_ota_mark_app_valid_cancel_rollback();
        if (err == ESP_OK) {
            healthConfirmed = true;
            needsVerification = false;
            storageManager.markBootConfirmed();
            Serial.println("[OTA SUCCESS] Local hardware and schedule engine verified healthy! Partition permanently confirmed.");
        } else {
            Serial.printf("[OTA WARNING] Failed to cancel rollback: %d\n", err);
        }
    }
}

bool OtaManager::verifyTokenConstantTime(const String& givenToken, const char* expectedToken) {
    if (!expectedToken) return false;
    size_t expectedLen = strlen(expectedToken);
    size_t givenLen = givenToken.length();

    // Constant-time length and byte comparison to prevent timing side-channel attacks
    unsigned char result = (givenLen ^ expectedLen);
    for (size_t i = 0; i < givenLen; i++) {
        char expectedChar = (i < expectedLen) ? expectedToken[i] : 0;
        result |= (givenToken[i] ^ expectedChar);
    }
    return (result == 0);
}

// =========================================================================
// Bug #3 Fix: Strict Host Component Parser (lowercase + boundary check)
// =========================================================================
bool OtaManager::parseAndValidateHost(const String& url, String& outHost) {
    // 1. Enforce HTTPS only (reject plaintext HTTP)
    if (!url.startsWith("https://")) {
        Serial.println("[OTA ERROR] Insecure protocol rejected! URL must begin with 'https://'");
        return false;
    }

    // 2. Extract host component strictly between "https://" and next '/' or ':'
    int hostStart = 8; // length of "https://"
    int hostEnd = url.indexOf('/', hostStart);
    int portIndex = url.indexOf(':', hostStart);

    if (portIndex != -1 && (hostEnd == -1 || portIndex < hostEnd)) {
        hostEnd = portIndex;
    }
    if (hostEnd == -1) {
        hostEnd = url.length();
    }

    String host = url.substring(hostStart, hostEnd);
    host.toLowerCase(); // Lowercase before comparison to prevent case-bypass
    outHost = host;

    if (host.length() == 0) {
        Serial.println("[OTA ERROR] Failed to parse host from URL!");
        return false;
    }

    // 3. Match against configured domain allowlist
    String allowlist = DEFAULT_ALLOWED_OTA_HOSTS;
    allowlist.toLowerCase();

    int start = 0;
    while (start < allowlist.length()) {
        int comma = allowlist.indexOf(',', start);
        String allowed = (comma == -1) ? allowlist.substring(start) : allowlist.substring(start, comma);
        allowed.trim();

        if (allowed.length() > 0) {
            // Check exact match or valid subdomain match (.allowed.com)
            if (host == allowed || host.endsWith("." + allowed)) {
                return true;
            }
        }

        if (comma == -1) break;
        start = comma + 1;
    }

    Serial.printf("[OTA ERROR] Host '%s' is not in authorized domain allowlist!\n", host.c_str());
    return false;
}

// =========================================================================
// Hardened OTA Streaming Flash with Mandatory SHA-256 Check
// =========================================================================
bool OtaManager::startOtaUpdate(const String& binUrl, const String& token, const String& expectedSha256) {
    if (inProgress) {
        Serial.println("[OTA ERROR] Update already in progress");
        return false;
    }

    // A. Shared Secret Token Validation
    if (!verifyTokenConstantTime(token, OTA_SECRET_TOKEN)) {
        Serial.println("[OTA ERROR] Unauthorized: Invalid or missing OTA secret token!");
        return false;
    }

    // B. Mandatory SHA-256 validation (Bug #2 review fix: must be present and 64 hex chars)
    if (expectedSha256.length() != 64) {
        Serial.println("[OTA ERROR] Mandatory SHA-256 digest missing or invalid! Must be 64-character hex string.");
        return false;
    }

    for (size_t i = 0; i < 64; i++) {
        char c = expectedSha256[i];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
            Serial.println("[OTA ERROR] SHA-256 contains non-hex characters!");
            return false;
        }
    }

    // C. Strict Protocol and Host Parsing
    String host;
    if (!parseAndValidateHost(binUrl, host)) {
        return false;
    }

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[OTA ERROR] WiFi disconnected!");
        return false;
    }

    inProgress = true;
    Serial.printf("[OTA] Commencing verified HTTPS download from: %s (Host: %s)\n", binUrl.c_str(), host.c_str());

    HTTPClient http;
    WiFiClientSecure client;

    // Bug #2 Fix: Pin DigiCert Global Root CA (no setInsecure()!)
    client.setCACert(DIGICERT_GLOBAL_ROOT_CA);

    http.begin(client, binUrl);
    http.setTimeout(15000);

    int httpCode = http.GET();
    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("[OTA ERROR] HTTP GET failed: %d (%s)\n", httpCode, http.errorToString(httpCode).c_str());
        http.end();
        inProgress = false;
        return false;
    }

    int contentLength = http.getSize();
    Serial.printf("[OTA] Image size: %d bytes\n", contentLength);

    if (contentLength <= 0 || contentLength > 1966080) { // Max ~1.9MB partition limit
        Serial.println("[OTA ERROR] Invalid firmware image size!");
        http.end();
        inProgress = false;
        return false;
    }

    // Initialize SHA-256 hash context
    mbedtls_sha256_context sha_ctx;
    mbedtls_sha256_init(&sha_ctx);
    mbedtls_sha256_starts(&sha_ctx, 0); // 0 = SHA-256 (not 224)

    if (!Update.begin(contentLength)) {
        Serial.printf("[OTA ERROR] Cannot begin update partition: %u\n", Update.getError());
        http.end();
        mbedtls_sha256_free(&sha_ctx);
        inProgress = false;
        return false;
    }

    WiFiClient* stream = http.getStreamPtr();
    uint8_t buffer[1024];
    size_t totalBytesWritten = 0;

    while (http.connected() && (totalBytesWritten < (size_t)contentLength)) {
        size_t available = stream->available();
        if (available > 0) {
            size_t toRead = min(available, sizeof(buffer));
            size_t bytesRead = stream->readBytes(buffer, toRead);

            // Update running SHA-256
            mbedtls_sha256_update(&sha_ctx, buffer, bytesRead);

            // Write to flash
            size_t written = Update.write(buffer, bytesRead);
            if (written != bytesRead) {
                Serial.printf("[OTA ERROR] Flash write failed! Error: %u\n", Update.getError());
                Update.abort();
                http.end();
                mbedtls_sha256_free(&sha_ctx);
                inProgress = false;
                return false;
            }
            totalBytesWritten += written;
        }
        yield();
    }

    // Compute final SHA-256 digest
    uint8_t computedHash[32];
    mbedtls_sha256_finish(&sha_ctx, computedHash);
    mbedtls_sha256_free(&sha_ctx);

    char computedHashStr[65];
    for (int i = 0; i < 32; i++) {
        sprintf(&computedHashStr[i * 2], "%02x", computedHash[i]);
    }
    computedHashStr[64] = '\0';

    Serial.printf("[OTA] Expected SHA-256: %s\n", expectedSha256.c_str());
    Serial.printf("[OTA] Computed SHA-256: %s\n", computedHashStr);

    // Verify SHA-256 match
    if (!expectedSha256.equalsIgnoreCase(computedHashStr)) {
        Serial.println("[OTA CRITICAL ERROR] SHA-256 digest mismatch! Aborting update and discarding image.");
        Update.abort();
        http.end();
        inProgress = false;
        return false;
    }

    if (!Update.end()) {
        Serial.printf("[OTA ERROR] Update.end() failed: %u\n", Update.getError());
        http.end();
        inProgress = false;
        return false;
    }

    if (!Update.isFinished()) {
        Serial.println("[OTA ERROR] Update not finished!");
        http.end();
        inProgress = false;
        return false;
    }

    Serial.println("[OTA SUCCESS] Firmware verified and written successfully! Marking boot pending and rebooting...");
    storageManager.markBootPending();
    http.end();
    delay(1000);
    ESP.restart();
    return true;
}

bool OtaManager::checkAndRollbackIfFailed() {
    if (esp_ota_check_rollback_is_possible()) {
        Serial.println("[OTA] Initiating rollback to previous stable partition!");
        esp_ota_mark_app_invalid_rollback_and_reboot();
        return true;
    }
    return false;
}
