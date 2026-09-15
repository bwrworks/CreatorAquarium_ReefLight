#include "oled_display.h"
#include <WiFi.h>
#include "schedule_engine.h"
#include "rtc_time.h"
#include "mqtt_manager.h"

OledDisplayManager oledDisplay;

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
      lastAcclimationScale(-1.0f)
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

    // 3. Initialize ST7735 controller with configured variant and orientation
    tft.initR(TFT_INIT_VARIANT);
    tft.setRotation(TFT_ROTATION);
#if defined(TFT_INVERT) && TFT_INVERT
    tft.invertDisplay(true);
#else
    tft.invertDisplay(false);
#endif

    // 4. Clean splash screen
    tft.fillScreen(ST77XX_BLACK);
    tft.setTextSize(1);

    tft.setTextColor(ST77XX_CYAN);
    tft.setCursor(18, 24);
    tft.print("REEF CONTROLLER");

    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(44, 42);
    tft.print("v" FIRMWARE_VERSION);

    tft.setTextColor(ST77XX_GREEN);
    tft.setCursor(24, 60);
    tft.print("Initializing...");

    // Spectrum decorative color bar
    tft.fillRect(14, 80, 25, 4, ST77XX_BLUE);
    tft.fillRect(39, 80, 25, 4, ST77XX_WHITE);
    tft.fillRect(64, 80, 25, 4, ST77XX_RED);
    tft.fillRect(89, 80, 25, 4, ST7735_MAGENTA);

    delay(750);

    // 5. Draw static UI layout once (flicker-free baseline)
    drawStaticLayout();
    displayPresent = true;
    Serial.printf("[TFT] ST7735 (128x128) initialized on CS:%d DC:%d RST:%d SCK:%d MOSI:%d LED:%d\n",
                  TFT_CS, TFT_DC, TFT_RST, TFT_SCLK, TFT_MOSI, TFT_LED);
    return true;
}

void OledDisplayManager::setBrightness(uint8_t brightness) {
    if (!displayPresent) return;
    // Digital on/off or analog backlight control
    digitalWrite(TFT_LED, brightness > 10 ? HIGH : LOW);
}

void OledDisplayManager::drawStaticLayout() {
    tft.fillScreen(ST77XX_BLACK);

    // Top Header separator (Y=12)
    tft.drawFastHLine(0, 12, 128, 0x4208);

    // Schedule Label (Y=26)
    tft.setTextSize(1);
    tft.setTextColor(0x7BEF); // dim gray
    tft.setCursor(2, 26);
    tft.print("Sched:");

    // Mid separator before channel bars (Y=36)
    tft.drawFastHLine(0, 36, 128, 0x4208);

    // Channel labels and bar frames (Y=40, 52, 64, 76)
    const char* labels[4] = {"BLU", "WHT", "RED", " UV"};
    const uint16_t colors[4] = {
        0x001F,  // Blue
        0xFFFF,  // White
        0xF800,  // Red
        0xF81F   // Magenta / UV
    };

    for (int i = 0; i < 4; i++) {
        int y = 40 + (i * 12);
        tft.setTextColor(colors[i]);
        tft.setCursor(2, y);
        tft.print(labels[i]);

        // Bar frame: x=24, y=y, w=74, h=8
        tft.drawRect(24, y, 74, 8, 0x52AA);
    }

    // Lower separator (Y=89)
    tft.drawFastHLine(0, 89, 128, 0x4208);

    // Fan label
    tft.setTextColor(0x7BEF);
    tft.setCursor(2, 93);
    tft.print("Fan:");

    layoutInitialized = true;
}

void OledDisplayManager::updateHeader(const String& timeStr, bool wifiOk, bool cloudOk) {
    tft.setTextSize(1);

    // Time: X=2, Y=2
    if (timeStr != lastTimeStr) {
        tft.setTextColor(ST77XX_CYAN, ST77XX_BLACK);
        tft.setCursor(2, 2);
        tft.print(timeStr);
        lastTimeStr = timeStr;
    }

    // WiFi Indicator: X=78, Y=2
    if ((int8_t)wifiOk != lastWifiOk) {
        tft.setCursor(78, 2);
        if (wifiOk) {
            tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
            tft.print("WF:OK");
        } else {
            tft.setTextColor(ST77XX_RED, ST77XX_BLACK);
            tft.print("WF:--");
        }
        lastWifiOk = (int8_t)wifiOk;
    }

    // MQTT Broker Indicator: X=112, Y=2
    if ((int8_t)cloudOk != lastCloudOk) {
        tft.setCursor(112, 2);
        if (cloudOk) {
            tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
            tft.print("MQ");
        } else {
            tft.setTextColor(ST77XX_RED, ST77XX_BLACK);
            tft.print("--");
        }
        lastCloudOk = (int8_t)cloudOk;
    }
}

void OledDisplayManager::updateModeAndPower(const String& mode, bool masterOn) {
    tft.setTextSize(1);

    // Operating Mode: X=2, Y=15
    if (mode != lastMode) {
        tft.setCursor(2, 15);
        if (mode == "manual") {
            tft.setTextColor(0xFD20, ST77XX_BLACK); // Amber / Orange
            tft.print("[MANUAL]");
        } else {
            tft.setTextColor(ST77XX_CYAN, ST77XX_BLACK);
            tft.print("[AUTO]  ");
        }
        lastMode = mode;
    }

    // Master Power Output: X=74, Y=15
    if ((int8_t)masterOn != lastMasterOn) {
        tft.setCursor(74, 15);
        if (masterOn) {
            tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
            tft.print("[PWR:ON] ");
        } else {
            tft.setTextColor(ST77XX_RED, ST77XX_BLACK);
            tft.print("[PWR:OFF]");
        }
        lastMasterOn = (int8_t)masterOn;
    }
}

void OledDisplayManager::updateSchedule(const String& scheduleId) {
    if (scheduleId != lastScheduleId) {
        tft.setTextSize(1);
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        tft.setCursor(42, 26);
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

    const uint16_t colors[4] = { 0x001F, 0xFFFF, 0xF800, 0xF81F };

    for (int i = 0; i < 4; i++) {
        int y = 40 + (i * 12);
        float pct = pcts[i];

        // Inner bar dimensions: width=70px, height=6px (x=26..95, y=y+1..y+6)
        int newW = (int)round((pct / 100.0f) * 70.0f);
        newW = constrain(newW, 0, 70);
        int oldW = lastBarWidth[i];

        // Differential redraw: only draw newly added or removed section
        if (newW != oldW || lastPct[i] < 0) {
            if (newW > oldW) {
                tft.fillRect(26 + oldW, y + 1, newW - oldW, 6, colors[i]);
            } else if (newW < oldW) {
                tft.fillRect(26 + newW, y + 1, oldW - newW, 6, ST77XX_BLACK);
            }
            lastBarWidth[i] = newW;
        }

        // Percentage text: X=101, Y=y
        if ((int)round(pct) != (int)round(lastPct[i]) || lastPct[i] < 0) {
            tft.setTextSize(1);
            tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
            tft.setCursor(101, y);
            char buf[8];
            snprintf(buf, sizeof(buf), "%3d%%", (int)round(pct));
            tft.print(buf);
            lastPct[i] = pct;
        }
    }
}

void OledDisplayManager::updateFooter(float fan, bool acclimationActive, int accDay, int accDaysTotal, float accScale) {
    tft.setTextSize(1);

    // Fan Speed (X=28, Y=93)
    if ((int)round(fan) != (int)round(lastFanPct)) {
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(28, 93);
        char buf[8];
        snprintf(buf, sizeof(buf), "%3d%%", (int)round(fan));
        tft.print(buf);
        lastFanPct = fan;
    }

    // PWM Status badge (X=74, Y=93)
    tft.setCursor(74, 93);
    if (lastMode == "manual") {
        tft.setTextColor(0xFD20, ST77XX_BLACK);
        tft.print("DIRECT PWM");
    } else {
        tft.setTextColor(ST77XX_CYAN, ST77XX_BLACK);
        tft.print("RAMP AUTO ");
    }

    // Bottom Area (Y=105, 116): Acclimation vs Device Status
    if (acclimationActive) {
        if (lastAcclimationActive != 1 || accDay != lastAcclimationDay || accScale != lastAcclimationScale) {
            tft.setTextColor(ST7735_MAGENTA, ST77XX_BLACK);
            tft.setCursor(2, 105);
            tft.print(">> ACCLIMATION RAMP <<");

            tft.setTextColor(ST77XX_YELLOW, ST77XX_BLACK);
            tft.setCursor(2, 116);
            char buf[24];
            snprintf(buf, sizeof(buf), "Day %d/%d (Scale %d%%) ", accDay, accDaysTotal, (int)round(accScale));
            tft.print(buf);

            lastAcclimationActive = 1;
            lastAcclimationDay = accDay;
            lastAcclimationScale = accScale;
        }
    } else {
        if (lastAcclimationActive != 0) {
            tft.setTextColor(0x7BEF, ST77XX_BLACK); // dim gray
            tft.setCursor(2, 105);
            tft.print("v" FIRMWARE_VERSION " | FreeRTOS      ");

            tft.setTextColor(0x03EF, ST77XX_BLACK); // subtle teal
            tft.setCursor(2, 116);
            tft.print("HiveMQ Cloud Connected ");

            lastAcclimationActive = 0;
        }
    }
}

void OledDisplayManager::loop() {
    if (!displayPresent) return;

    unsigned long now = millis();
    if (now - lastRenderMillis < 400) return; // Refresh at ~2.5 Hz with zero flicker
    lastRenderMillis = now;

    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(WiFi.status() == WL_CONNECTED, mqttManager.isConnected());

    updateHeader(rtcManager.getFormattedTime(), state.wifiConnected, state.cloudConnected);
    updateModeAndPower(state.mode, state.masterOn);
    updateSchedule(state.activeScheduleId);
    updateChannels(state.live.blue, state.live.white, state.live.red, state.live.uv);

    int elapsedDays = 0;
    float currentScale = 100.0f;
    if (state.acclimation.active) {
        elapsedDays = 0;
        currentScale = state.acclimation.startPct;
    }

    updateFooter(state.live.fan, state.acclimation.active, elapsedDays, state.acclimation.daysTotal, currentScale);
}
