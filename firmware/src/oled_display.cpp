#include "oled_display.h"
#include <WiFi.h>
#include <math.h>
#include "schedule_engine.h"
#include "rtc_time.h"
#include "mqtt_manager.h"

OledDisplayManager oledDisplay;

// =========================================================================
// Creators Aquarium Color Palette (RGB565 High-Contrast Dark Theme)
// =========================================================================
#define C_BG            0x0000 // Deep Black
#define C_CARD_BORDER   0x1A4F // Slate Cyan Card Border (RGB: 26, 73, 120)
#define C_SLOT_BG       0x18C6 // Recessed Slider Slot (RGB: 24, 24, 48)
#define C_CYAN          0x07FF // Glowing Cyan
#define C_BLUE          0x2BDF // Coral Sky Blue
#define C_WHITE         0xFFFF // Crisp White
#define C_UV            0xC81F // Actinic Violet
#define C_GREEN         0x07E0 // Emerald Green
#define C_PURPLE        0x981F // Deep Purple / Magenta (for MQTT pill)
#define C_ORANGE        0xFD20 // Warm Amber
#define C_GOLD          0xFFE0 // Golden Yellow
#define C_DIM_GRAY      0x632C // Dim Gray

OledDisplayManager::OledDisplayManager()
    : tftSPI(HSPI),
      tft(&tftSPI, TFT_CS, TFT_DC, TFT_RST),
      displayPresent(false),
      layoutInitialized(false),
      lastRenderMillis(0),
      lastViewSwitchMillis(0),
      manualModeLockMillis(0),
      currentView(0),
      lastTimeStr(""),
      lastWifiOk(-1),
      lastCloudOk(-1),
      lastMode(""),
      lastMasterOn(-1),
      lastScheduleId(""),
      lastFanPct(-1.0f),
      lastAcclimationActive(-1),
      lastAcclimationDay(-1),
      lastAcclimationScale(-1.0f),
      lastIpStr(""),
      lastOverrideStr(""),
      lastStatusLineStr(""),
      lastSunDotX(-1),
      lastSunDotY(-1)
{
    for (int i = 0; i < 3; i++) {
        lastPct[i] = -1.0f;
        lastBarWidth[i] = 0;
    }
}

bool OledDisplayManager::begin() {
    ledcSetup(LEDC_CHANNEL_DISPLAY, LEDC_DISPLAY_FREQ_HZ, LEDC_DISPLAY_RESOLUTION);
    ledcWrite(LEDC_CHANNEL_DISPLAY, LEDC_DISPLAY_MAX_DUTY); // full brightness until real value is applied
    ledcAttachPin(TFT_LED, LEDC_CHANNEL_DISPLAY);

    tftSPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
    tftSPI.setFrequency(8000000); // 8MHz for signal stability

    tft.initR(TFT_INIT_VARIANT);
    tft.setSPISpeed(8000000);
    tft.setRotation(TFT_ROTATION);
#if defined(TFT_INVERT) && TFT_INVERT
    tft.invertDisplay(true);
#else
    tft.invertDisplay(false);
#endif

    // Splash screen
    tft.fillScreen(C_BG);
    tft.setTextSize(1);

    tft.setTextColor(C_CYAN);
    tft.setCursor(10, 24);
    tft.print("CREATORS AQUARIUM");

    tft.setTextColor(C_WHITE);
    tft.setCursor(14, 40);
    tft.print("REEF CONTROLLER");

    // Spectrum decorative color bar (Blue, White, UV)
    tft.fillRect(14, 60, 45, 4, C_BLUE);
    tft.fillRect(59, 60, 35, 4, C_WHITE);
    tft.fillRect(94, 60, 20, 4, C_UV);

    tft.setTextColor(C_GREEN);
    tft.setCursor(24, 80);
    tft.print("Initializing...");

    tft.setTextColor(C_DIM_GRAY);
    tft.setCursor(18, 98);
    tft.print("Brighter Reefs");

    drawView0Static();
    currentView = 0;
    lastViewSwitchMillis = millis();
    displayPresent = true;

    Serial.printf("[TFT] ST7735 (128x128 Landscape @ 8MHz, Rot:%d) initialized on CS:%d DC:%d RST:%d SCK:%d MOSI:%d LED:%d (PWM Ch:%d)\n",
                  TFT_ROTATION, TFT_CS, TFT_DC, TFT_RST, TFT_SCLK, TFT_MOSI, TFT_LED, LEDC_CHANNEL_DISPLAY);
    return true;
}

void OledDisplayManager::setBrightness(uint8_t brightness) {
    ledcWrite(LEDC_CHANNEL_DISPLAY, brightness);
}

// =========================================================================
// VIEW 0: Light Control Sliders + Rainbow Daylight Spectrum Arch Curve
// =========================================================================
void OledDisplayManager::drawView0Static() {
    tft.fillScreen(C_BG);

    // Card 1: Top Bar (X=0, Y=0, W=128, H=17)
    tft.drawRoundRect(0, 0, 128, 17, 3, C_CARD_BORDER);

    // Card 2: Light Control Sliders (X=0, Y=19, W=128, H=45)
    tft.drawRoundRect(0, 19, 128, 45, 3, C_CARD_BORDER);

    const char* labels[3] = {"BLU", "WHT", " UV"};
    const uint16_t colors[3] = { C_BLUE, C_WHITE, C_UV };

    for (int i = 0; i < 3; i++) {
        int y = 22 + (i * 11);
        tft.setTextSize(1);
        tft.setTextColor(colors[i], C_BG);
        tft.setCursor(3, y);
        tft.print(labels[i]);

        // Recessed track slot: X=24, Y=y+1, W=66, H=5
        tft.fillRoundRect(24, y + 1, 66, 5, 2, C_SLOT_BG);
    }

    // Card 3: Schedule & Rainbow Daylight Spectrum Arch (X=0, Y=66, W=128, H=47)
    tft.drawRoundRect(0, 66, 128, 47, 3, C_CARD_BORDER);

    tft.setTextSize(1);
    tft.setTextColor(0x05BF, C_BG); // Dim Cyan
    tft.setCursor(3, 69);
    tft.print("Sched:");

    drawRainbowArch();

    // Time markers below arch
    tft.setTextSize(1);
    tft.setTextColor(C_DIM_GRAY, C_BG);
    tft.setCursor(6, 102);
    tft.print("06:00");
    tft.setCursor(44, 102);
    tft.print("12:00");
    tft.setCursor(78, 102);
    tft.print("18:00");
    tft.setCursor(102, 102);
    tft.print("22");

    // Card 4: Bottom Status Bar (X=0, Y=115, W=128, H=13)
    tft.drawRoundRect(0, 115, 128, 13, 2, C_CARD_BORDER);
    tft.setTextColor(C_DIM_GRAY, C_BG);
    tft.setCursor(3, 117);
    tft.print("Fan:");

    // Reset differential caches
    lastTimeStr = "";
    lastWifiOk = -1;
    lastCloudOk = -1;
    lastMode = "";
    lastMasterOn = -1;
    lastScheduleId = "";
    lastFanPct = -1.0f;
    lastOverrideStr = "";
    lastSunDotX = -1;
    lastSunDotY = -1;
    for (int i = 0; i < 3; i++) {
        lastPct[i] = -1.0f;
        lastBarWidth[i] = 0;
    }
}

void OledDisplayManager::drawRainbowArch() {
    // Beautiful glowing rainbow daylight spectrum arch curve
    // X = 11 to 116 (106 pixels wide), arch peaks at Y=79, base at Y=96
    for (int x = 0; x < 106; x++) {
        float angle = (x / 105.0f) * 3.14159f;
        int y = 96 - (int)(sinf(angle) * 16.0f);

        uint16_t col;
        if (x < 22) col = C_ORANGE;      // 06:00 Sunrise
        else if (x < 44) col = C_GOLD;   // 09:00 Morning
        else if (x < 62) col = C_WHITE;  // 12:00 Peak Solar
        else if (x < 84) col = C_BLUE;   // 18:00 Dusk Blue
        else col = C_UV;                 // 22:00 Moon Actinic

        tft.drawPixel(11 + x, y, col);
        tft.drawPixel(11 + x, y + 1, col); // 2px thick glowing line
    }
}

void OledDisplayManager::renderView0(const DeviceStateSnapshot& state, const String& timeStr) {
    tft.setTextSize(1);

    // 1. Digital Clock (X=3, Y=4)
    if (timeStr != lastTimeStr) {
        tft.setTextColor(C_WHITE, C_BG);
        tft.setCursor(3, 4);
        tft.print(timeStr);
        lastTimeStr = timeStr;
    }

    // 2. WiFi Pill (X=58, Y=3, W=18, H=8)
    if ((int8_t)state.wifiConnected != lastWifiOk) {
        if (state.wifiConnected) {
            tft.fillRoundRect(58, 3, 18, 8, 2, C_GREEN);
            tft.setTextColor(C_BG);
            tft.setCursor(60, 4);
            tft.print("WF");
        } else {
            tft.fillRoundRect(58, 3, 18, 8, 2, 0xF800);
            tft.setTextColor(C_WHITE);
            tft.setCursor(60, 4);
            tft.print("--");
        }
        lastWifiOk = (int8_t)state.wifiConnected;
    }

    // 3. MQTT Pill (X=78, Y=3, W=18, H=8)
    if ((int8_t)state.cloudConnected != lastCloudOk) {
        if (state.cloudConnected) {
            tft.fillRoundRect(78, 3, 18, 8, 2, C_PURPLE);
            tft.setTextColor(C_WHITE);
            tft.setCursor(80, 4);
            tft.print("MQ");
        } else {
            tft.fillRoundRect(78, 3, 18, 8, 2, 0xF800);
            tft.setTextColor(C_WHITE);
            tft.setCursor(80, 4);
            tft.print("--");
        }
        lastCloudOk = (int8_t)state.cloudConnected;
    }

    // 4. Power Output Badge (X=100, Y=4)
    if ((int8_t)state.masterOn != lastMasterOn) {
        tft.setCursor(100, 4);
        if (state.masterOn) {
            tft.setTextColor(C_GREEN, C_BG);
            tft.print("[ON] ");
        } else {
            tft.setTextColor(0xF800, C_BG);
            tft.print("[OFF]");
        }
        lastMasterOn = (int8_t)state.masterOn;
    }

    // 5. Three Channel Sliders (BLU, WHT, UV)
    float pcts[3] = { state.live.blue, state.live.white, state.live.uv };
    const uint16_t colors[3] = { C_BLUE, C_WHITE, C_UV };

    for (int i = 0; i < 3; i++) {
        int y = 22 + (i * 11);
        float pct = constrain(pcts[i], 0.0f, 100.0f);
        int newW = (int)round((pct / 100.0f) * 62.0f);
        newW = constrain(newW, 0, 62);
        int oldW = lastBarWidth[i];

        if (newW != oldW || lastPct[i] < 0) {
            if (newW > oldW) {
                tft.fillRect(25 + oldW, y + 2, newW - oldW, 3, colors[i]);
            } else if (newW < oldW) {
                tft.fillRect(25 + newW, y + 2, (oldW - newW) + 3, 3, C_SLOT_BG);
            }
            // Glowing white slider thumb knob
            tft.fillRect(25 + newW, y + 1, 3, 5, C_WHITE);
            lastBarWidth[i] = newW;
        }

        // Percentage readout: X=93, Y=y
        if ((int)round(pct) != (int)round(lastPct[i]) || lastPct[i] < 0) {
            tft.setTextColor(C_WHITE, C_BG);
            tft.setCursor(93, y);
            char buf[8];
            snprintf(buf, sizeof(buf), "%3d%%", (int)round(pct));
            tft.print(buf);
            lastPct[i] = pct;
        }
    }

    // 6. Active Schedule Name (X=38, Y=69)
    if (state.activeScheduleId != lastScheduleId) {
        tft.setTextColor(C_WHITE, C_BG);
        tft.setCursor(38, 69);
        char buf[16];
        snprintf(buf, sizeof(buf), "%-14.14s", state.activeScheduleId.c_str());
        tft.print(buf);
        lastScheduleId = state.activeScheduleId;
    }

    // 7. Live Sun-Tracking Dot along the Rainbow Arch
    time_t rawEpoch = rtcManager.getEpoch() + rtcManager.getTimezoneOffset();
    struct tm* ti = gmtime(&rawEpoch);
    int secOfDay = ti->tm_hour * 3600 + ti->tm_min * 60 + ti->tm_sec;

    int newSunX = 11, newSunY = 96;
    if (secOfDay >= 21600 && secOfDay <= 79200) { // 06:00 to 22:00
        float prog = (float)(secOfDay - 21600) / 57600.0f;
        prog = constrain(prog, 0.0f, 1.0f);
        newSunX = 11 + (int)(prog * 105.0f);
        newSunY = 96 - (int)(sinf(prog * 3.14159f) * 16.0f);
    } else {
        newSunX = 116; // Night moon position
        newSunY = 96;
    }

    if (newSunX != lastSunDotX || newSunY != lastSunDotY) {
        if (lastSunDotX >= 0) {
            drawRainbowArch(); // Redraw arch to erase previous dot cleanly
        }
        tft.fillCircle(newSunX, newSunY, 2, (secOfDay >= 21600 && secOfDay <= 79200) ? C_WHITE : C_UV);
        lastSunDotX = newSunX;
        lastSunDotY = newSunY;
    }

    // 8. Bottom Bar: Fan Speed (X=27, Y=117)
    if ((int)round(state.live.fan) != (int)round(lastFanPct)) {
        tft.setTextColor(C_CYAN, C_BG);
        tft.setCursor(27, 117);
        char buf[8];
        snprintf(buf, sizeof(buf), "%3d%%", (int)round(state.live.fan));
        tft.print(buf);
        lastFanPct = state.live.fan;
    }

    // 9. Mode / Override Countdown (X=54, Y=117)
    char ovrBuf[16];
    if (state.mode == "manual") {
        if (state.manualOverrideRemainingSec > 0) {
            long m = state.manualOverrideRemainingSec / 60;
            long s = state.manualOverrideRemainingSec % 60;
            snprintf(ovrBuf, sizeof(ovrBuf), "OVR:%02ldm%02lds", m, s);
        } else {
            snprintf(ovrBuf, sizeof(ovrBuf), "MANUAL HOLD");
        }
    } else {
        snprintf(ovrBuf, sizeof(ovrBuf), "AUTO RAMP  ");
    }

    String ovrStr = String(ovrBuf);
    if (ovrStr != lastOverrideStr) {
        tft.setTextColor(state.mode == "manual" ? C_ORANGE : C_CYAN, C_BG);
        tft.setCursor(54, 117);
        tft.print(ovrStr);
        lastOverrideStr = ovrStr;
    }

    // Page indicator (X=115, Y=117)
    tft.setTextColor(C_DIM_GRAY, C_BG);
    tft.setCursor(115, 117);
    tft.print("1");
}

// =========================================================================
// VIEW 1: 24h Live Intensity Curves + System Status Table
// =========================================================================
void OledDisplayManager::drawView1Static() {
    tft.fillScreen(C_BG);

    // Card 1: Top Bar (X=0, Y=0, W=128, H=17)
    tft.drawRoundRect(0, 0, 128, 17, 3, C_CARD_BORDER);

    // Card 2: Live Intensity 24h Graph (X=0, Y=19, W=128, H=50)
    tft.drawRoundRect(0, 19, 128, 50, 3, C_CARD_BORDER);
    tft.setTextSize(1);
    tft.setTextColor(C_CYAN, C_BG);
    tft.setCursor(4, 22);
    tft.print("Live Intensity (24h)");

    draw24hIntensityGraph();

    // Card 3: System Status Table (X=0, Y=71, W=128, H=57)
    tft.drawRoundRect(0, 71, 128, 57, 3, C_CARD_BORDER);
    tft.setTextColor(C_CYAN, C_BG);
    tft.setCursor(4, 74);
    tft.print("System Status");

    // Labels for status table
    tft.setTextColor(C_DIM_GRAY, C_BG);
    tft.setCursor(4, 84);
    tft.print("Mode:");
    tft.setCursor(4, 93);
    tft.print("Status:");
    tft.setCursor(4, 102);
    tft.print("Fan:");
    tft.setCursor(4, 111);
    tft.print("Cloud:");
    tft.setCursor(4, 120);
    tft.print("IP:");

    // Page indicator (X=115, Y=74)
    tft.setCursor(115, 74);
    tft.print("2");

    // Reset caches for view 1
    lastTimeStr = "";
    lastWifiOk = -1;
    lastCloudOk = -1;
    lastMode = "";
    lastStatusLineStr = "";
    lastIpStr = "";
}

void OledDisplayManager::draw24hIntensityGraph() {
    // Graph Area: X=8..120 (112px wide), Y=33..57 (24px high)
    // Dashed 50% gridline
    for (int x = 8; x < 120; x += 4) {
        tft.drawPixel(x, 45, 0x18C6);
    }
    // Baseline axis
    tft.drawFastHLine(8, 57, 112, C_CARD_BORDER);

    // Plot simulated 24h natural reef curves for Blue, White, UV (3 channels)
    int prevY[3] = { 57, 57, 57 };
    const uint16_t colors[3] = { C_BLUE, C_WHITE, C_UV };
    const float maxPcts[3] = { 85.0f, 55.0f, 45.0f };

    for (int x = 0; x < 112; x++) {
        float h = (x / 111.0f) * 24.0f; // 0..24h
        for (int ch = 0; ch < 3; ch++) {
            float pct = 0.0f;
            if (h >= 6.0f && h <= 20.0f) {
                float bell = sinf(((h - 6.0f) / 14.0f) * 3.14159f);
                pct = maxPcts[ch] * (bell * bell);
            }
            int y = 57 - (int)((pct / 100.0f) * 22.0f);
            if (x > 0) {
                tft.drawLine(8 + (x - 1), prevY[ch], 8 + x, y, colors[ch]);
            }
            prevY[ch] = y;
        }
    }

    // Time Axis Labels (Y=59)
    tft.setTextSize(1);
    tft.setTextColor(C_DIM_GRAY, C_BG);
    tft.setCursor(6, 60);
    tft.print("00    06    12    18    24");
}

void OledDisplayManager::renderView1(const DeviceStateSnapshot& state, const String& timeStr) {
    tft.setTextSize(1);

    // Top Bar: Clock (X=3, Y=4)
    if (timeStr != lastTimeStr) {
        tft.setTextColor(C_WHITE, C_BG);
        tft.setCursor(3, 4);
        tft.print(timeStr);
        lastTimeStr = timeStr;
    }

    // WiFi & MQTT Pills
    if ((int8_t)state.wifiConnected != lastWifiOk) {
        tft.fillRoundRect(58, 3, 18, 8, 2, state.wifiConnected ? C_GREEN : 0xF800);
        tft.setTextColor(state.wifiConnected ? C_BG : C_WHITE);
        tft.setCursor(60, 4);
        tft.print(state.wifiConnected ? "WF" : "--");
        lastWifiOk = (int8_t)state.wifiConnected;
    }
    if ((int8_t)state.cloudConnected != lastCloudOk) {
        tft.fillRoundRect(78, 3, 18, 8, 2, state.cloudConnected ? C_PURPLE : 0xF800);
        tft.setTextColor(C_WHITE);
        tft.setCursor(80, 4);
        tft.print(state.cloudConnected ? "MQ" : "--");
        lastCloudOk = (int8_t)state.cloudConnected;
    }

    // Firmware version at top right
    tft.setTextColor(C_DIM_GRAY, C_BG);
    tft.setCursor(100, 4);
    tft.print("v1.2");

    // System Status Table Values
    // Row 1: Mode (X=46, Y=84)
    tft.setCursor(46, 84);
    tft.setTextColor(state.mode == "manual" ? C_ORANGE : C_CYAN, C_BG);
    tft.print(state.mode == "manual" ? "MANUAL PWM " : "AUTO RAMP  ");

    // Row 2: Status (X=50, Y=93)
    tft.setCursor(50, 93);
    if (state.acclimation.active) {
        tft.setTextColor(C_GOLD, C_BG);
        char buf[16];
        snprintf(buf, sizeof(buf), "Day %d/%d (%d%%)", state.acclimationDaysElapsed, state.acclimation.daysTotal, (int)round(state.acclimationCurrentScale));
        tft.print(buf);
    } else {
        tft.setTextColor(C_GREEN, C_BG);
        tft.print("Schedule OK   ");
    }

    // Row 3: Fan Speed (X=36, Y=102)
    tft.setCursor(36, 102);
    tft.setTextColor(C_CYAN, C_BG);
    char fanBuf[12];
    snprintf(fanBuf, sizeof(fanBuf), "%3d%% PWM", (int)round(state.live.fan));
    tft.print(fanBuf);

    // Row 4: Cloud Status (X=46, Y=111)
    tft.setCursor(46, 111);
    tft.setTextColor(state.cloudConnected ? C_GREEN : 0xF800, C_BG);
    tft.print(state.cloudConnected ? "Connected  " : "Connecting ");

    // Row 5: Local IP Address (X=24, Y=120)
    String ip = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : "Disconnected";
    if (ip != lastIpStr) {
        tft.setCursor(24, 120);
        tft.setTextColor(WiFi.status() == WL_CONNECTED ? C_WHITE : 0xF800, C_BG);
        char ipBuf[18];
        snprintf(ipBuf, sizeof(ipBuf), "%-15.15s", ip.c_str());
        tft.print(ipBuf);
        lastIpStr = ip;
    }
}

void OledDisplayManager::loop() {
    if (!displayPresent) return;

    unsigned long now = millis();
    if (now - lastRenderMillis < 400) return; // ~2.5 Hz refresh rate
    lastRenderMillis = now;

    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(WiFi.status() == WL_CONNECTED, mqttManager.isConnected());
    String timeStr = rtcManager.getFormattedTime();

    // If in manual mode, hold on View 0 (Control view) so sliders/countdown are always visible
    if (state.mode == "manual") {
        manualModeLockMillis = now;
        if (currentView != 0) {
            currentView = 0;
            drawView0Static();
        }
    } else {
        // In Auto mode, cycle between View 0 and View 1 every 8 seconds
        if (now - manualModeLockMillis > 5000 && now - lastViewSwitchMillis > 8000) {
            currentView = (currentView + 1) % 2;
            lastViewSwitchMillis = now;
            if (currentView == 0) {
                drawView0Static();
            } else {
                drawView1Static();
            }
        }
    }

    if (currentView == 0) {
        renderView0(state, timeStr);
    } else {
        renderView1(state, timeStr);
    }
}
