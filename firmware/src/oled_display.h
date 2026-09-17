#pragma once

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include "../include/config.h"

struct DeviceStateSnapshot;

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
    unsigned long lastViewSwitchMillis;
    unsigned long manualModeLockMillis;
    uint8_t currentView; // 0 = Control & Spectrum Arch, 1 = 24h Curves & System Status

    // Cache of last drawn values for flicker-free differential redraws
    String lastTimeStr;
    int8_t lastWifiOk;
    int8_t lastCloudOk;
    String lastMode;
    int8_t lastMasterOn;
    String lastScheduleId;
    float lastPct[3];       // Blue, White, UV
    int lastBarWidth[3];    // 0..64 pixels
    float lastFanPct;
    int8_t lastAcclimationActive;
    int lastAcclimationDay;
    float lastAcclimationScale;
    String lastIpStr;
    String lastOverrideStr;
    String lastStatusLineStr;
    int lastSunDotX;
    int lastSunDotY;

    void drawView0Static();
    void drawView1Static();
    void drawRainbowArch();
    void draw24hIntensityGraph();
    void renderView0(const DeviceStateSnapshot& state, const String& timeStr);
    void renderView1(const DeviceStateSnapshot& state, const String& timeStr);
};

extern OledDisplayManager oledDisplay;
