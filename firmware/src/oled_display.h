#pragma once

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include "../include/config.h"

class OledDisplayManager {
public:
    OledDisplayManager();
    bool begin();
    void loop();
    void setBrightness(uint8_t brightness);

private:
    SPIClass tftSPI;
    Adafruit_ST7735 tft;
    bool displayPresent;
    bool layoutInitialized;
    unsigned long lastRenderMillis;

    // Cache of last drawn values for flicker-free differential redraws
    String lastTimeStr;
    int8_t lastWifiOk;
    int8_t lastCloudOk;
    String lastMode;
    int8_t lastMasterOn;
    String lastScheduleId;
    float lastPct[4];       // Blue, White, Red, UV
    int lastBarWidth[4];    // 0..70 pixels
    float lastFanPct;
    int8_t lastAcclimationActive;
    int lastAcclimationDay;
    float lastAcclimationScale;

    void drawStaticLayout();
    void updateHeader(const String& timeStr, bool wifiOk, bool cloudOk);
    void updateModeAndPower(const String& mode, bool masterOn);
    void updateSchedule(const String& scheduleId);
    void updateChannels(float blue, float white, float red, float uv);
    void updateFooter(float fan, bool acclimationActive, int accDay, int accDaysTotal, float accScale);
};

extern OledDisplayManager oledDisplay;
