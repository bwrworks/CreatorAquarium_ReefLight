#include "ota_manager.h"
#include <WiFiClientSecure.h>
#include "storage_manager.h"

OtaManager otaManager;

OtaManager::OtaManager() : inProgress(false) {}

void OtaManager::begin() {
    const esp_partition_t* running = esp_ota_get_running_partition();
    esp_ota_img_states_t ota_state;
    if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
        if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
            Serial.println("[OTA] Partition is pending verification. Monitoring health...");
            // Will be marked valid in MqttManager once cloud connection succeeds
        }
    }
}

bool OtaManager::startOtaUpdate(const String& binUrl) {
    if (inProgress || WiFi.status() != WL_CONNECTED) return false;
    inProgress = true;

    Serial.printf("[OTA] Commencing download from: %s\n", binUrl.c_str());

    HTTPClient http;
    WiFiClientSecure client;
    client.setInsecure(); // Allow fetching from user's HTTPS release assets

    http.begin(client, binUrl);
    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("[OTA] HTTP GET failed, error: %d (%s)\n", httpCode, http.errorToString(httpCode).c_str());
        http.end();
        inProgress = false;
        return false;
    }

    int contentLength = http.getSize();
    Serial.printf("[OTA] Image size: %d bytes\n", contentLength);

    if (contentLength <= 0) {
        Serial.println("[OTA] Invalid firmware image size!");
        http.end();
        inProgress = false;
        return false;
    }

    bool canBegin = Update.begin(contentLength);
    if (!canBegin) {
        Serial.printf("[OTA] Not enough space to begin OTA: %u\n", Update.getError());
        http.end();
        inProgress = false;
        return false;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);

    if (written != (size_t)contentLength) {
        Serial.printf("[OTA] Written only %d/%d bytes. Error: %u\n", (int)written, contentLength, Update.getError());
        Update.abort();
        http.end();
        inProgress = false;
        return false;
    }

    if (!Update.end()) {
        Serial.printf("[OTA] Update.end() failed! Error: %u\n", Update.getError());
        http.end();
        inProgress = false;
        return false;
    }

    if (!Update.isFinished()) {
        Serial.println("[OTA] Update not finished!");
        http.end();
        inProgress = false;
        return false;
    }

    Serial.println("[OTA] Update successfully applied! Marking boot as pending and restarting ESP32...");
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
