#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "../include/config.h"

class OledDisplayManager {
public:
    OledDisplayManager();
    bool begin();
    void loop(); // Handles automatic page cycling
    void setBrightness(uint8_t brightness);

private:
    Adafruit_SSD1306 display;
    bool displayPresent;
    int currentPage;
    unsigned long lastPageSwitchMillis;

    void drawPage1_Status();
    void drawPage2_Channels();
    void drawPage3_Network();
    void drawPage4_Alerts();
};

extern OledDisplayManager oledDisplay;
