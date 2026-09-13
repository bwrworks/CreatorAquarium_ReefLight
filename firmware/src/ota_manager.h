#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include "../include/config.h"

class OtaManager {
public:
    OtaManager();
    void begin();
    
    // Purely local health check (decoupled from cloud reachability)
    void checkAndConfirmLocalHealth();
    bool isHealthConfirmed() const { return healthConfirmed; }

    // Hardened OTA update
    // Requirements: HTTPS only, exact domain allowlist, valid shared secret, mandatory 64-char SHA256
    bool startOtaUpdate(const String& binUrl, const String& token, const String& expectedSha256);
    
    // Rollback test helper
    bool checkAndRollbackIfFailed();

    // Helper to extract and validate host
    static bool parseAndValidateHost(const String& url, String& outHost);

private:
    bool inProgress;
    bool healthConfirmed;
    bool needsVerification;

    bool verifyTokenConstantTime(const String& givenToken, const char* expectedToken);
};

extern OtaManager otaManager;
