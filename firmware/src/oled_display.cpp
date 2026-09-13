#include "oled_display.h"
#include <WiFi.h>
#include "schedule_engine.h"
#include "rtc_time.h"
#include "mqtt_manager.h"

OledDisplayManager oledDisplay;

OledDisplayManager::OledDisplayManager()
    : display(OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, &Wire, -1),
      displayPresent(false),
      currentPage(0),
      lastPageSwitchMillis(0) {}

bool OledDisplayManager::begin() {
    if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
        Serial.println("[OLED] SSD1306 allocation failed (not found on 0x3C)");
        displayPresent = false;
        return false;
    }

    displayPresent = true;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);

    display.setCursor(18, 16);
    display.print("REEF CONTROLLER");
    display.setCursor(32, 34);
    display.print("v" FIRMWARE_VERSION);
    display.setCursor(24, 48);
    display.print("Initializing...");
    display.display();

    delay(800);
    return true;
}

void OledDisplayManager::setBrightness(uint8_t brightness) {
    if (!displayPresent) return;
    display.dim(brightness < 128);
}

void OledDisplayManager::loop() {
    if (!displayPresent) return;

    unsigned long now = millis();
    if (now - lastPageSwitchMillis >= OLED_PAGE_INTERVAL_MS) {
        lastPageSwitchMillis = now;
        currentPage = (currentPage + 1) % 4;
    }

    display.clearDisplay();

    switch (currentPage) {
        case 0: drawPage1_Status(); break;
        case 1: drawPage2_Channels(); break;
        case 2: drawPage3_Network(); break;
        case 3: drawPage4_Alerts(); break;
    }

    // Page indicator dots at bottom center
    for (int i = 0; i < 4; i++) {
        int x = 54 + (i * 6);
        int y = 62;
        if (i == currentPage) {
            display.fillCircle(x, y, 2, SSD1306_WHITE);
        } else {
            display.drawPixel(x, y, SSD1306_WHITE);
        }
    }

    display.display();
}

void OledDisplayManager::drawPage1_Status() {
    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(WiFi.status() == WL_CONNECTED, mqttManager.isConnected());

    // Header: Time & Mode
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("TIME: ");
    display.print(rtcManager.getFormattedTime());

    display.setCursor(85, 0);
    if (state.mode == "manual") {
        display.print("[MANUAL]");
    } else {
        display.print("[AUTO]");
    }

    display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

    // Active Schedule
    display.setCursor(0, 16);
    display.print("Schedule: ");
    display.print(state.activeScheduleId);

    // Acclimation
    display.setCursor(0, 28);
    if (state.acclimation.active) {
        display.printf("Acclim: %.0f%% (%d d)", state.acclimation.startPct, state.acclimation.daysTotal);
    } else {
        display.print("Acclimation: Inactive");
    }

    // Master Status
    display.setCursor(0, 40);
    display.printf("Master LEDs: %s", state.masterOn ? "ON" : "OFF (0%)");

    if (state.mode == "manual" && state.manualOverrideExpiresAt.length() > 0) {
        display.setCursor(0, 50);
        display.print("Reverts in: <2h");
    }
}

void OledDisplayManager::drawPage2_Channels() {
    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(WiFi.status() == WL_CONNECTED, mqttManager.isConnected());

    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("LIVE CHANNELS");
    display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

    // 4 Channel meters: B, W, R, UV
    struct ChItem { const char* label; float val; int y; };
    ChItem items[] = {
        {"BLU", state.live.blue, 13},
        {"WHT", state.live.white, 24},
        {"RED", state.live.red, 35},
        {"UV ", state.live.uv, 46}
    };

    for (int i = 0; i < 4; i++) {
        display.setCursor(0, items[i].y);
        display.print(items[i].label);

        // Bar outline
        display.drawRect(26, items[i].y, 68, 7, SSD1306_WHITE);
        int fillW = (int)((items[i].val / 100.0f) * 66.0f);
        if (fillW > 0) {
            display.fillRect(27, items[i].y + 1, fillW, 5, SSD1306_WHITE);
        }

        display.setCursor(98, items[i].y);
        display.printf("%3.0f%%", items[i].val);
    }
}

void OledDisplayManager::drawPage3_Network() {
    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    bool cloudOk = mqttManager.isConnected();

    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("CONNECTIVITY");
    display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

    display.setCursor(0, 14);
    display.printf("WiFi:  %s", wifiOk ? "Connected" : "Disconnected");

    display.setCursor(0, 24);
    if (wifiOk) {
        display.printf("IP:    %s", WiFi.localIP().toString().c_str());
    } else {
        display.print("IP:    None (Portal)");
    }

    display.setCursor(0, 35);
    display.printf("Cloud: %s", cloudOk ? "HiveMQ TLS OK" : "Connecting...");

    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(wifiOk, cloudOk);
    display.setCursor(0, 46);
    display.printf("Fan:   %.0f%%", state.live.fan);
}

void OledDisplayManager::drawPage4_Alerts() {
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("SYSTEM ALERTS");
    display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    bool cloudOk = mqttManager.isConnected();
    bool rtcOk = rtcManager.isTimeConfirmed();

    int line = 14;
    if (!rtcOk) {
        display.setCursor(0, line);
        display.print("! Time Unconfirmed");
        line += 11;
    }
    if (!wifiOk) {
        display.setCursor(0, line);
        display.print("! WiFi Offline");
        line += 11;
    } else if (!cloudOk) {
        display.setCursor(0, line);
        display.print("! Cloud Disconnected");
        line += 11;
    }

    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(wifiOk, cloudOk);
    if (state.mode == "manual") {
        display.setCursor(0, line);
        display.print("! Manual Override On");
        line += 11;
    }

    if (line == 14) {
        display.setCursor(0, 24);
        display.print("No Active Alerts.");
        display.setCursor(0, 36);
        display.print("System Nominal.");
    }
}
