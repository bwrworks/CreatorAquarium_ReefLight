#include "oled_display.h"
#include <WiFi.h>
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
#define C_RED           0xFA08 // Coral Neon Red
#define C_UV            0xC81F // Actinic Violet
#define C_GREEN         0x07E0 // Emerald Green
#define C_PURPLE        0x981F // Deep Purple / Magenta (for MQTT pill)
#define C_ORANGE        0xFD20 // Warm Amber
#define C_DIM_GRAY      0x632C // Dim Gray

OledDisplayManager::OledDisplayManager()
    : tftSPI(VSPI),
      tft(&tftSPI, TFT_CS, TFT_DC, TFT_RST),
      displayPresent(false),
      layoutInitialized(false),
      lastRenderMillis(0),
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
      lastStatusLineStr("")
{
    for (int i = 0; i < 4; i++) {
        lastPct[i] = -1.0f;
        lastBarWidth[i] = 0;
    }
}

bool OledDisplayManager::begin() {
    // 1. Backlight control via GPIO 26 (Onboard R1 current-limited resistor)
    pinMode(TFT_LED, OUTPUT);
    digitalWrite(TFT_LED, HIGH);

    // 2. Hardware SPI via ESP32 GPIO Matrix (SCK=27, MISO=-1, MOSI=23, SS=5)
    tftSPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
    tftSPI.setFrequency(8000000); // 8MHz for breadboard jumper integrity

    // 3. Initialize ST7735 controller with configured variant and landscape orientation
    tft.initR(TFT_INIT_VARIANT);
    tft.setSPISpeed(8000000);
    tft.setRotation(TFT_ROTATION); // Rotation 1: Landscape mode
#if defined(TFT_INVERT) && TFT_INVERT
    tft.invertDisplay(true);
#else
    tft.invertDisplay(false);
#endif

    // 4. Splash screen
    tft.fillScreen(C_BG);
    tft.setTextSize(1);

    tft.setTextColor(C_CYAN);
    tft.setCursor(12, 22);
    tft.print("CREATORS AQUARIUM");

    tft.setTextColor(C_WHITE);
    tft.setCursor(14, 38);
    tft.print("REEF CONTROLLER");

    tft.setTextColor(C_DIM_GRAY);
    tft.setCursor(32, 54);
    tft.print("v" FIRMWARE_VERSION " (LAND)");

    // Decorative spectrum bar
    tft.fillRect(14, 76, 25, 4, C_BLUE);
    tft.fillRect(39, 76, 25, 4, C_WHITE);
    tft.fillRect(64, 76, 25, 4, C_RED);
    tft.fillRect(89, 76, 25, 4, C_UV);

    tft.setTextColor(C_GREEN);
    tft.setCursor(24, 94);
    tft.print("Initializing...");

    delay(750);

    // 5. Draw static UI layout
    drawStaticLayout();
    displayPresent = true;
    Serial.printf("[TFT] ST7735 (128x128 Landscape @ 8MHz, Rot:%d) initialized on CS:%d DC:%d RST:%d SCK:%d MOSI:%d LED:%d\n",
                  TFT_ROTATION, TFT_CS, TFT_DC, TFT_RST, TFT_SCLK, TFT_MOSI, TFT_LED);
    return true;
}

void OledDisplayManager::setBrightness(uint8_t brightness) {
    if (!displayPresent) return;
    digitalWrite(TFT_LED, brightness > 10 ? HIGH : LOW);
}

void OledDisplayManager::drawStaticLayout() {
    tft.fillScreen(C_BG);

    // Card 1: Top Header Card (X=0, Y=0, W=128, H=23)
    tft.drawRoundRect(0, 0, 128, 23, 3, C_CARD_BORDER);

    tft.setTextSize(1);
    tft.setTextColor(C_CYAN, C_BG);
    tft.setCursor(4, 3);
    tft.print("CREATORS REEF");

    // Card 2: Light Control Card (X=0, Y=25, W=128, H=51)
    tft.drawRoundRect(0, 25, 128, 51, 3, C_CARD_BORDER);

    // Channel labels and recessed slider slots
    const char* labels[4] = {"BLU", "WHT", "RED", " UV"};
    const uint16_t colors[4] = { C_BLUE, C_WHITE, C_RED, C_UV };

    for (int i = 0; i < 4; i++) {
        int y = 28 + (i * 12);
        tft.setTextColor(colors[i], C_BG);
        tft.setCursor(3, y);
        tft.print(labels[i]);

        // Recessed slider slot: X=24, Y=y+1, W=68, H=6
        tft.fillRoundRect(24, y + 1, 68, 6, 2, C_SLOT_BG);
    }

    // Card 3: System & Schedule Card (X=0, Y=78, W=128, H=50)
    tft.drawRoundRect(0, 78, 128, 50, 3, C_CARD_BORDER);

    tft.setTextColor(0x05BF, C_BG); // Dim Cyan
    tft.setCursor(3, 81);
    tft.print("Sched:");

    tft.setTextColor(C_DIM_GRAY, C_BG);
    tft.setCursor(3, 92);
    tft.print("Fan:");

    layoutInitialized = true;
}

void OledDisplayManager::updateHeader(const String& timeStr, bool wifiOk, bool cloudOk) {
    tft.setTextSize(1);

    // 1. WiFi Status Pill (X=86, Y=2, W=18, H=8)
    if ((int8_t)wifiOk != lastWifiOk) {
        if (wifiOk) {
            tft.fillRoundRect(86, 2, 18, 8, 2, C_GREEN);
            tft.setTextColor(C_BG);
            tft.setCursor(88, 3);
            tft.print("WF");
        } else {
            tft.fillRoundRect(86, 2, 18, 8, 2, 0xF800);
            tft.setTextColor(C_WHITE);
            tft.setCursor(88, 3);
            tft.print("--");
        }
        lastWifiOk = (int8_t)wifiOk;
    }

    // 2. MQTT Cloud Pill (X=106, Y=2, W=18, H=8)
    if ((int8_t)cloudOk != lastCloudOk) {
        if (cloudOk) {
            tft.fillRoundRect(106, 2, 18, 8, 2, C_PURPLE);
            tft.setTextColor(C_WHITE);
            tft.setCursor(108, 3);
            tft.print("MQ");
        } else {
            tft.fillRoundRect(106, 2, 18, 8, 2, 0xF800);
            tft.setTextColor(C_WHITE);
            tft.setCursor(108, 3);
            tft.print("--");
        }
        lastCloudOk = (int8_t)cloudOk;
    }

    // 3. Digital Clock (X=4, Y=12)
    if (timeStr != lastTimeStr) {
        tft.setTextColor(C_WHITE, C_BG);
        tft.setCursor(4, 12);
        tft.print(timeStr);
        lastTimeStr = timeStr;
    }
}

void OledDisplayManager::updateModeAndPower(const String& mode, bool masterOn) {
    tft.setTextSize(1);

    // Mode Badge (X=58, Y=12)
    if (mode != lastMode) {
        tft.setCursor(58, 12);
        if (mode == "manual") {
            tft.setTextColor(C_ORANGE, C_BG);
            tft.print("[MAN] ");
        } else {
            tft.setTextColor(C_CYAN, C_BG);
            tft.print("[AUTO]");
        }
        lastMode = mode;
    }

    // Master Power Output Badge (X=96, Y=12)
    if ((int8_t)masterOn != lastMasterOn) {
        tft.setCursor(96, 12);
        if (masterOn) {
            tft.setTextColor(C_GREEN, C_BG);
            tft.print("[ON] ");
        } else {
            tft.setTextColor(0xF800, C_BG);
            tft.print("[OFF]");
        }
        lastMasterOn = (int8_t)masterOn;
    }
}

void OledDisplayManager::updateSchedule(const String& scheduleId) {
    if (scheduleId != lastScheduleId) {
        tft.setTextSize(1);
        tft.setTextColor(C_WHITE, C_BG);
        tft.setCursor(40, 81);
        char buf[16];
        snprintf(buf, sizeof(buf), "%-14.14s", scheduleId.c_str());
        tft.print(buf);
        lastScheduleId = scheduleId;
    }
}

void OledDisplayManager::updateChannels(float blue, float white, float red, float uv) {
    float pcts[4] = {
        constrain(blue, 0.0f, 100.0f),
        constrain(white, 0.0f, 100.0f),
        constrain(red, 0.0f, 100.0f),
        constrain(uv, 0.0f, 100.0f)
    };

    const uint16_t colors[4] = { C_BLUE, C_WHITE, C_RED, C_UV };

    for (int i = 0; i < 4; i++) {
        int y = 28 + (i * 12);
        float pct = pcts[i];

        // Usable inner slider track length = 64 pixels (x = 25..89)
        int newW = (int)round((pct / 100.0f) * 64.0f);
        newW = constrain(newW, 0, 64);
        int oldW = lastBarWidth[i];

        // Differential redraw of progress bar + glowing thumb knob
        if (newW != oldW || lastPct[i] < 0) {
            if (newW > oldW) {
                // Extend colored fill
                tft.fillRect(25 + oldW, y + 2, newW - oldW, 4, colors[i]);
            } else if (newW < oldW) {
                // Clear retracted region back to slot background
                tft.fillRect(25 + newW, y + 2, (oldW - newW) + 4, 4, C_SLOT_BG);
            }
            // Draw sleek white slider thumb knob at current position
            tft.fillRect(25 + newW, y + 1, 3, 6, C_WHITE);
            lastBarWidth[i] = newW;
        }

        // Percentage readout: X=96, Y=y
        if ((int)round(pct) != (int)round(lastPct[i]) || lastPct[i] < 0) {
            tft.setTextSize(1);
            tft.setTextColor(C_WHITE, C_BG);
            tft.setCursor(96, y);
            char buf[8];
            snprintf(buf, sizeof(buf), "%3d%%", (int)round(pct));
            tft.print(buf);
            lastPct[i] = pct;
        }
    }
}

void OledDisplayManager::updateFooter(float fan, const String& mode, long remSec, bool acclimationActive, int accDay, int accDaysTotal, float accScale, const String& ipStr) {
    tft.setTextSize(1);

    // 1. Fan Speed (X=28, Y=92)
    if ((int)round(fan) != (int)round(lastFanPct)) {
        tft.setTextColor(C_CYAN, C_BG);
        tft.setCursor(28, 92);
        char buf[8];
        snprintf(buf, sizeof(buf), "%3d%%", (int)round(fan));
        tft.print(buf);
        lastFanPct = fan;
    }

    // 2. Mode / Manual Override Countdown (X=54, Y=92)
    char ovrBuf[16];
    if (mode == "manual") {
        if (remSec > 0) {
            long h = remSec / 3600;
            long m = (remSec % 3600) / 60;
            long s = remSec % 60;
            if (h > 0) {
                snprintf(ovrBuf, sizeof(ovrBuf), "OVR:%ldh%02ldm ", h, m);
            } else {
                snprintf(ovrBuf, sizeof(ovrBuf), "OVR:%02ldm%02lds", m, s);
            }
        } else {
            snprintf(ovrBuf, sizeof(ovrBuf), "MANUAL HOLD");
        }
    } else {
        snprintf(ovrBuf, sizeof(ovrBuf), "AUTO RAMP  ");
    }

    String ovrStr = String(ovrBuf);
    if (ovrStr != lastOverrideStr) {
        if (mode == "manual") {
            tft.setTextColor(C_ORANGE, C_BG);
        } else {
            tft.setTextColor(C_CYAN, C_BG);
        }
        tft.setCursor(54, 92);
        tft.print(ovrStr);
        lastOverrideStr = ovrStr;
    }

    // 3. Status / Acclimation Row (X=3, Y=104)
    char statusBuf[24];
    uint16_t statusColor;
    if (acclimationActive) {
        snprintf(statusBuf, sizeof(statusBuf), "ACC: Day %d/%d (%d%%)  ",
                 accDay, accDaysTotal, (int)round(accScale));
        statusColor = 0xFFE0; // Bright Yellow
    } else {
        snprintf(statusBuf, sizeof(statusBuf), "Status: Schedule OK  ");
        statusColor = C_GREEN;
    }

    String statusStr = String(statusBuf);
    if (statusStr != lastStatusLineStr) {
        tft.setTextColor(statusColor, C_BG);
        tft.setCursor(3, 104);
        tft.print(statusStr);
        lastStatusLineStr = statusStr;
    }

    // 4. Device Local IP Address (X=3, Y=116)
    char ipBuf[24];
    bool isConnected = (ipStr.length() > 0 && ipStr != "0.0.0.0" && ipStr != "Disconnected");
    if (isConnected) {
        snprintf(ipBuf, sizeof(ipBuf), "IP: %-17.17s", ipStr.c_str());
    } else {
        snprintf(ipBuf, sizeof(ipBuf), "IP: Disconnected    ");
    }

    String fullIpStr = String(ipBuf);
    if (fullIpStr != lastIpStr) {
        tft.setTextColor(isConnected ? C_GREEN : 0xF800, C_BG);
        tft.setCursor(3, 116);
        tft.print(fullIpStr);
        lastIpStr = fullIpStr;
    }
}

void OledDisplayManager::loop() {
    if (!displayPresent) return;

    unsigned long now = millis();
    if (now - lastRenderMillis < 400) return; // ~2.5 Hz refresh with zero flicker
    lastRenderMillis = now;

    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(WiFi.status() == WL_CONNECTED, mqttManager.isConnected());

    updateHeader(rtcManager.getFormattedTime(), state.wifiConnected, state.cloudConnected);
    updateModeAndPower(state.mode, state.masterOn);
    updateSchedule(state.activeScheduleId);
    updateChannels(state.live.blue, state.live.white, state.live.red, state.live.uv);

    String ipStr = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : "Disconnected";

    updateFooter(state.live.fan,
                 state.mode,
                 state.manualOverrideRemainingSec,
                 state.acclimation.active,
                 state.acclimationDaysElapsed,
                 state.acclimation.daysTotal,
                 state.acclimationCurrentScale,
                 ipStr);
}
