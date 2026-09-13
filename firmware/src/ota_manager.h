#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_ota_ops.h>

class OtaManager {
public:
    OtaManager();
    void begin();
    bool startOtaUpdate(const String& binUrl);
    bool checkAndRollbackIfFailed();

private:
    bool inProgress;
};

extern OtaManager otaManager;
