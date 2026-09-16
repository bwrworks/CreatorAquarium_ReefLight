#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "../include/config.h"
#include "ledc_driver.h"
#include "rtc_time.h"
#include "storage_manager.h"
#include "schedule_engine.h"
#include "mqtt_manager.h"
#include "oled_display.h"
#include "ota_manager.h"

// Default broker credentials from secrets.h
#ifdef DEFAULT_MQTT_HOST
char hivemqHost[64] = DEFAULT_MQTT_HOST;
#else
char hivemqHost[64] = "c7e756c95d22406988e67a7e6caabb02.s1.eu.hivemq.cloud";
#endif

char hivemqPort[6]  = "8883";

#ifdef DEFAULT_MQTT_USER
char hivemqUser[32] = DEFAULT_MQTT_USER;
#else
char hivemqUser[32] = "Reef_light";
#endif

#ifdef DEFAULT_MQTT_PASS
char hivemqPass[32] = DEFAULT_MQTT_PASS;
#else
char hivemqPass[32] = "LQ#9OVUSZ1S";
#endif

char deviceId[32]   = DEFAULT_DEVICE_ID;

void setupWiFi() {
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);

#if defined(DEFAULT_WIFI_SSID) && defined(DEFAULT_WIFI_PASS)
    if (strlen(DEFAULT_WIFI_SSID) > 0) {
        Serial.printf("[BOOT] Attempting direct connection to predefined WiFi '%s'...\n", DEFAULT_WIFI_SSID);
        WiFi.mode(WIFI_STA);
        WiFi.begin(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASS);
        unsigned long startMs = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - startMs < 20000) {
            delay(500);
            Serial.print(".");
        }
        Serial.println();
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
            IPAddress dns1(8, 8, 8, 8);
            IPAddress dns2(1, 1, 1, 1);
            WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), dns1, dns2);
            Serial.println("[WIFI] Primary DNS set to 8.8.8.8, secondary 1.1.1.1");
            return;
        }
        Serial.println("[WIFI] Direct connection failed. Falling back to setup portal...");
    }
#endif

    WiFiManager wm;
    wm.setConfigPortalTimeout(60); // 1 minute timeout if no one configures

    WiFiManagerParameter customMqttHost("host", "HiveMQ Host", hivemqHost, 64);
    WiFiManagerParameter customMqttUser("user", "MQTT Username", hivemqUser, 32);
    WiFiManagerParameter customMqttPass("pass", "MQTT Password", hivemqPass, 32);
    WiFiManagerParameter customDevId("devid", "Device ID", deviceId, 32);

    wm.addParameter(&customMqttHost);
    wm.addParameter(&customMqttUser);
    wm.addParameter(&customMqttPass);
    wm.addParameter(&customDevId);

    Serial.println("[BOOT] Connecting to WiFi (or starting AP 'Reef-Light-Setup')...");
    bool connected = wm.autoConnect("Reef-Light-Setup", "reef1234");

    if (connected) {
        Serial.printf("[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
        IPAddress dns1(8, 8, 8, 8);
        IPAddress dns2(1, 1, 1, 1);
        WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), dns1, dns2);
        if (strlen(customMqttHost.getValue()) > 0) strncpy(hivemqHost, customMqttHost.getValue(), sizeof(hivemqHost));
        if (strlen(customMqttUser.getValue()) > 0) strncpy(hivemqUser, customMqttUser.getValue(), sizeof(hivemqUser));
        if (strlen(customMqttPass.getValue()) > 0) strncpy(hivemqPass, customMqttPass.getValue(), sizeof(hivemqPass));
        if (strlen(customDevId.getValue()) > 0) strncpy(deviceId, customDevId.getValue(), sizeof(deviceId));
    } else {
        Serial.println("[WIFI] Failed to connect or hit timeout. Running in standalone autonomous mode.");
    }
}

void processSerialCommand(const String& cmd) {
    String c = cmd;
    c.trim();
    if (c.length() == 0) return;

    Serial.printf("[CLI] Command: %s\n", c.c_str());

    if (c.equalsIgnoreCase("status")) {
        DeviceStateSnapshot s = scheduleEngine.getStateSnapshot(WiFi.status() == WL_CONNECTED, mqttManager.isConnected());
        Serial.printf("=== REEF STATUS ===\n");
        Serial.printf("Time: %s (Confirmed: %s, RTC HW: %s)\n", s.time.c_str(),
                      rtcManager.isTimeConfirmed() ? "YES" : "NO",
                      rtcManager.hasRtcHardware() ? "YES" : "NO");
        Serial.printf("Mode: %s (Active Schedule: %s)\n", s.mode.c_str(), s.activeScheduleId.c_str());
        Serial.printf("Channels -> Blue: %.1f%%, White: %.1f%%, Red: %.1f%%, UV: %.1f%%, Fan: %.1f%%\n",
                      s.live.blue, s.live.white, s.live.red, s.live.uv, s.live.fan);
        Serial.printf("Master LEDs: %s\n", s.masterOn ? "ON" : "OFF");
        Serial.printf("WiFi: %s, Cloud: %s\n", s.wifiConnected ? "CONNECTED" : "OFFLINE", s.cloudConnected ? "CONNECTED" : "OFFLINE");
        return;
    }

    if (c.equalsIgnoreCase("auto")) {
        scheduleEngine.setMode("auto");
        Serial.println("[CLI] Mode set to AUTO.");
        return;
    }

    if (c.equalsIgnoreCase("manual")) {
        scheduleEngine.setMode("manual");
        Serial.println("[CLI] Mode set to MANUAL.");
        return;
    }

    if (c.equalsIgnoreCase("master on")) {
        scheduleEngine.setMasterOn(true);
        Serial.println("[CLI] Master LEDs turned ON.");
        return;
    }

    if (c.equalsIgnoreCase("master off")) {
        scheduleEngine.setMasterOn(false);
        Serial.println("[CLI] Master LEDs turned OFF.");
        return;
    }

    if (c.startsWith("set ")) {
        // Format: set <b%> <w%> <r%> <uv%>
        float b = 0, w = 0, r = 0, uv = 0;
        if (sscanf(c.c_str(), "set %f %f %f %f", &b, &w, &r, &uv) == 4) {
            scheduleEngine.setManualChannels(b, w, r, uv);
            Serial.printf("[CLI] Manual channels set: B=%.1f%%, W=%.1f%%, R=%.1f%%, UV=%.1f%%\n", b, w, r, uv);
            return;
        }
    }

    if (c.startsWith("fan ")) {
        float fan = c.substring(4).toFloat();
        scheduleEngine.setFan(fan);
        Serial.printf("[CLI] Fan set to: %.1f%%\n", fan);
        return;
    }

    if (c.startsWith("time ")) {
        String iso = c.substring(5);
        if (rtcManager.setTimeFromISO(iso)) {
            Serial.printf("[CLI] Time set to: %s\n", iso.c_str());
        } else {
            Serial.println("[CLI] Invalid ISO time format. Use: YYYY-MM-DDTHH:MM:SS");
        }
        return;
    }

    if (c.equalsIgnoreCase("resetwifi")) {
        WiFiManager wm;
        wm.resetSettings();
        Serial.println("[CLI] WiFi settings erased! Restarting...");
        delay(500);
        ESP.restart();
        return;
    }

    Serial.println("[CLI] Commands: status | auto | manual | set <b> <w> <r> <uv> | fan <pct> | master on/off | time <ISO> | resetwifi");
}

void setup() {
    // Disable brownout detector to prevent reboot loops on buck converters or noisy external power
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

    if (strcmp(OTA_SECRET_TOKEN, "REPLACE_WITH_SECURE_RANDOM_TOKEN_HERE") == 0) {
        Serial.begin(115200);
        Serial.println("FATAL: OTA_SECRET_TOKEN still has the placeholder value in secrets.h — edit it before flashing.");
        while (true) { delay(1000); }
    }

    Serial.begin(115200);
    delay(300);
    Serial.println("\n==================================================");
    Serial.println("   REEF AQUARIUM LED CONTROLLER v" FIRMWARE_VERSION);
    Serial.println("==================================================");

    // 0. Hold active-low LED driver pins HIGH immediately to prevent current surge on power-on
    pinMode(PIN_LED_BLUE, OUTPUT);
    digitalWrite(PIN_LED_BLUE, HIGH);
    pinMode(PIN_LED_RED, OUTPUT);
    digitalWrite(PIN_LED_RED, HIGH);
    pinMode(PIN_LED_WHITE, OUTPUT);
    digitalWrite(PIN_LED_WHITE, HIGH);
    pinMode(PIN_LED_UV, OUTPUT);
    digitalWrite(PIN_LED_UV, HIGH);
    pinMode(PIN_FAN_PWM, OUTPUT);
    digitalWrite(PIN_FAN_PWM, HIGH); // Active-high PWM: start HIGH so fan spins immediately on boot

    // Initialize I2C bus once with timeout
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setTimeOut(50);

    // 1. Initialize Display and DS3231 RTC first
    oledDisplay.begin();
    rtcManager.begin();

    // 2. Initialize LEDC hardware outputs (Blue: 18, Red: 19, White: 32, UV: 33, Fan: 4)
    ledcDriver.begin();

    // 3. Initialize Flash Storage (LittleFS and NVS Preferences)
    storageManager.begin();

    // 4. Initialize OTA Manager and boot verification
    otaManager.begin();

    // 5. Initialize Autonomous Schedule Engine (FreeRTOS Task on Core 1)
    scheduleEngine.begin();

    // 6. Connect WiFi / Provisioning
    setupWiFi();

    // 7. Initialize opportunistic NTP
    if (WiFi.status() == WL_CONNECTED) {
        rtcManager.syncNtp();
    }

    // 8. Initialize HiveMQ Cloud TLS MQTT Manager (FreeRTOS Task on Core 0)
    mqttManager.begin(hivemqHost, atoi(hivemqPort), hivemqUser, hivemqPass, deviceId);

    Serial.println("[BOOT] Initialization complete. Core schedule engine running autonomously.");
}

void loop() {
    // Check and confirm local health for OTA partition validity (SRS NFR-1)
    otaManager.checkAndConfirmLocalHealth();

    // Auto-reconnect WiFi if connection drops
    if (WiFi.status() != WL_CONNECTED) {
        static unsigned long lastWifiRetry = 0;
        if (millis() - lastWifiRetry > 5000) {
            lastWifiRetry = millis();
            WiFi.reconnect();
        }
    }

    // Background RTC drift maintenance
    rtcManager.loop();

    // Update OLED cycling display
    oledDisplay.loop();

    // Read Serial CLI commands for local testing
    if (Serial.available() > 0) {
        String input = Serial.readStringUntil('\n');
        processSerialCommand(input);
    }

    delay(20);
}
