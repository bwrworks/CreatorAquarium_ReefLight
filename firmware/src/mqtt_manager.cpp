#include "mqtt_manager.h"
#include <WiFi.h>
#include "storage_manager.h"
#include "ota_manager.h"

MqttManager mqttManager;

MqttManager::MqttManager()
    : mqttClient(secureClient),
      broker(""),
      brokerPort(DEFAULT_MQTT_PORT),
      username(""),
      password(""),
      devId(DEFAULT_DEVICE_ID),
      lastReconnectAttempt(0),
      reconnectInterval(2000),
      lastHeartbeatMillis(0),
      lastCmdMillis(0),
      stateDirty(false) {}

void MqttManager::setupTopics() {
    topicState       = "reef/" + devId + "/state";
    topicStatus      = "reef/" + devId + "/status";
    topicCmdWildcard = "reef/" + devId + "/cmd/#";
}

void MqttManager::begin(const char* brokerHost, uint16_t port, const char* user, const char* pass, const char* deviceId) {
    broker = brokerHost;
    brokerPort = port;
    username = user;
    password = pass;
    devId = (deviceId && strlen(deviceId) > 0) ? deviceId : DEFAULT_DEVICE_ID;

    setupTopics();

    // Enable TLS encryption for HiveMQ Cloud (port 8883)
    secureClient.setInsecure();
    secureClient.setTimeout(10000); // 10000ms = 10s socket timeout

    mqttClient.setServer(broker.c_str(), brokerPort);
    mqttClient.setBufferSize(2048); // Allow large schedule payloads
    mqttClient.setKeepAlive(30);
    mqttClient.setSocketTimeout(15);
    mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length) {
        this->handleIncomingMessage(topic, payload, length);
    });

    // Launch FreeRTOS Task on Core 0 for networking
    xTaskCreatePinnedToCore(
        MqttManager::taskFunction,
        "MqttTask",
        10240, // 10KB stack required for mbedTLS TLS negotiation
        this,
        1, // Priority 1
        NULL,
        0  // Core 0
    );
}

void MqttManager::taskFunction(void* param) {
    MqttManager* mgr = (MqttManager*)param;
    for (;;) {
        mgr->loop();
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

bool MqttManager::isConnected() {
    return mqttClient.connected();
}

void MqttManager::connectToBroker() {
    if (WiFi.status() != WL_CONNECTED || broker.length() == 0) return;

    // Terminate any stale socket before re-negotiating TLS session
    secureClient.stop();

    Serial.printf("[MQTT] Connecting to HiveMQ Cloud %s:%d as %s...\n",
                  broker.c_str(), brokerPort, devId.c_str());

    // Always connect using domain name so TLS Server Name Indication (SNI) is preserved for HiveMQ Cloud
    mqttClient.setServer(broker.c_str(), brokerPort);

    // LWT: Status topic with payload "offline", QoS 1, retained = true (TDD §4 & SRS FR-14)
    String clientId = devId + "-" + String(random(1000, 9999));
    bool success = false;
    if (username.length() > 0) {
        success = mqttClient.connect(clientId.c_str(), username.c_str(), password.c_str(),
                                    topicStatus.c_str(), 1, true, "offline");
    } else {
        success = mqttClient.connect(clientId.c_str(), topicStatus.c_str(), 1, true, "offline");
    }

    if (success) {
        Serial.println("[MQTT] Connected to broker successfully!");
        reconnectInterval = 2000; // Reset backoff

        // 1. Publish "online" status (retained, QoS 1)
        mqttClient.publish(topicStatus.c_str(), "online", true);

        // 2. Subscribe to all command topics
        mqttClient.subscribe(topicCmdWildcard.c_str(), 1);
        Serial.printf("[MQTT] Subscribed to %s\n", topicCmdWildcard.c_str());

        // 3. Mark boot as confirmed in NVS if this is first successful connect post-OTA
        storageManager.markBootConfirmed();

        // 4. Publish full retained state immediately
        publishState();
    } else {
        Serial.printf("[MQTT] Connect failed, rc=%d. Retrying in %lu ms\n",
                      mqttClient.state(), reconnectInterval);
        secureClient.stop();
        reconnectInterval = min(reconnectInterval * 2, 60000UL); // Exponential backoff max 60s
    }
}

void MqttManager::loop() {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (!mqttClient.connected()) {
        unsigned long now = millis();
        if (now - lastReconnectAttempt > reconnectInterval) {
            lastReconnectAttempt = now;
            connectToBroker();
        }
    } else {
        mqttClient.loop();

        unsigned long now = millis();
        // Periodic heartbeat publish every 15 seconds, or if state is dirty and active commands have settled for 800ms
        bool dirtySettled = stateDirty && (now - lastCmdMillis >= 800UL);
        bool heartbeat = (now - lastHeartbeatMillis >= 15000UL);
        if (dirtySettled || heartbeat) {
            lastHeartbeatMillis = now;
            stateDirty = false;
            publishState();
        }
    }
}

void MqttManager::publishState() {
    if (!mqttClient.connected()) return;

    // Re-assert online status alongside state
    mqttClient.publish(topicStatus.c_str(), "online", true);

    DeviceStateSnapshot state = scheduleEngine.getStateSnapshot(WiFi.status() == WL_CONNECTED, true);

    JsonDocument doc;
    doc["mode"] = state.mode;

    JsonObject live = doc["live"].to<JsonObject>();
    live["blue"]  = round(state.live.blue  * 10.0f) / 10.0f;
    live["white"] = round(state.live.white * 10.0f) / 10.0f;
    live["uv"]    = round(state.live.uv    * 10.0f) / 10.0f;
    live["fan"]   = round(state.live.fan   * 10.0f) / 10.0f;

    if (state.manualOverrideExpiresAt.length() > 0) {
        doc["manualOverrideExpiresAt"] = state.manualOverrideExpiresAt;
    } else {
        doc["manualOverrideExpiresAt"] = nullptr;
    }

    doc["activeScheduleId"] = state.activeScheduleId;

    if (state.acclimation.active) {
        JsonObject acc = doc["acclimation"].to<JsonObject>();
        acc["active"] = true;
        acc["scheduleId"] = state.acclimation.scheduleId;
        acc["startPct"] = state.acclimation.startPct;
        acc["daysTotal"] = state.acclimation.daysTotal;
        acc["startedAt"] = state.acclimation.startedAt;
    } else {
        doc["acclimation"] = nullptr;
    }

    doc["time"] = state.time;
    doc["wifiConnected"] = state.wifiConnected;
    doc["cloudConnected"] = true;
    doc["firmwareVersion"] = state.firmwareVersion;
    doc["masterOn"] = state.masterOn;
    doc["fanInverted"] = state.fanInverted;
    doc["fanManualOverride"] = state.fanManualOverride;
    doc["displayBrightness"] = state.displayBrightness;

    char buffer[1024];
    size_t len = serializeJson(doc, buffer, sizeof(buffer));

    // Retained QoS 1 publish
    mqttClient.publish(topicState.c_str(), (const uint8_t*)buffer, len, true);
}

void MqttManager::handleIncomingMessage(char* topic, byte* payload, unsigned int length) {
    char payloadStr[length + 1];
    memcpy(payloadStr, payload, length);
    payloadStr[length] = '\0';

    Serial.printf("[MQTT CMD] Received on topic '%s': %s\n", topic, payloadStr);

    String topicStr = String(topic);
    String prefix = "reef/" + devId + "/cmd/";

    if (!topicStr.startsWith(prefix)) return;
    String cmd = topicStr.substring(prefix.length());
    lastCmdMillis = millis();

    // Release boot quiet hold immediately on any cloud command
    scheduleEngine.releaseBootHold();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payloadStr);

    if (cmd == "channels") {
        if (!err) {
            float b  = doc["blue"]  | 0.0f;
            float w  = doc["white"] | 0.0f;
            float uv = doc["uv"]    | 0.0f;
            scheduleEngine.setManualChannels(b, w, uv);
            stateDirty = true;
        }
    } else if (cmd == "mode") {
        if (!err) {
            String mode = doc["mode"] | "auto";
            scheduleEngine.setMode(mode);
            stateDirty = true;
        }
    } else if (cmd == "fan") {
        float val = 0.0f;
        if (!err) {
            if (doc["value"].is<float>()) {
                val = doc["value"].as<float>();
            } else if (doc["fan"].is<float>()) {
                val = doc["fan"].as<float>();
            } else if (doc.is<float>()) {
                val = doc.as<float>();
            }
        } else {
            val = (float)atof(payloadStr);
        }
        val = constrain(val, 0.0f, 100.0f);
        scheduleEngine.setFan(val);
        stateDirty = true;
    } else if (cmd == "fanpol" || cmd == "fan_polarity") {
        bool inv = false;
        if (!err) {
            if (doc["inverted"].is<bool>()) inv = doc["inverted"].as<bool>();
            else if (doc["value"].is<int>()) inv = doc["value"].as<int>() > 0;
            else if (doc["inv"].is<bool>()) inv = doc["inv"].as<bool>();
        } else {
            inv = (atoi(payloadStr) > 0);
        }
        storageManager.setFanInverted(inv);
        ledcDriver.setFanInverted(inv);
        stateDirty = true;
        Serial.printf("[MQTT CMD] Fan polarity set to %s\n", inv ? "INVERTED (Active-Low)" : "NORMAL (Active-High)");
    } else if (cmd == "display" || cmd == "display_brightness") {
        int bright = 255;
        if (!err) {
            if (doc["brightness"].is<int>()) bright = doc["brightness"].as<int>();
            else if (doc["value"].is<int>()) bright = doc["value"].as<int>();
            else if (doc.is<int>()) bright = doc.as<int>();
        } else {
            bright = atoi(payloadStr);
        }
        bright = constrain(bright, 0, 255);
        scheduleEngine.setDisplayBrightness(bright);
        stateDirty = true;
        Serial.printf("[MQTT CMD] Display brightness set to %d\n", bright);
    } else if (cmd == "master") {
        if (!err) {
            bool on = true;
            if (doc["master"].is<bool>()) {
                on = doc["master"].as<bool>();
            } else if (doc["master"].is<int>()) {
                on = doc["master"].as<int>() > 0;
            } else {
                on = doc["master"] | true;
            }
            scheduleEngine.setMasterOn(on);
            stateDirty = true;
        }
    } else if (cmd == "schedule") {
        if (!err) {
            String action = doc["action"] | "save";
            if (action == "delete") {
                const char* id = doc["id"];
                if (id) storageManager.deleteSchedule(String(id));
            } else {
                storageManager.saveSchedule(String(payloadStr));
            }
            scheduleEngine.reloadConfig();
            stateDirty = true;
        }
    } else if (cmd == "weekly") {
        if (!err) {
            storageManager.saveWeeklyAssignment(String(payloadStr));
            scheduleEngine.reloadConfig();
            stateDirty = true;
        }
    } else if (cmd == "acclimation") {
        if (!err) {
            String action = doc["action"] | "";
            if (action == "start") {
                String schedId = doc["scheduleId"] | "natural_reef";
                float startPct = doc["startPct"] | 50.0f;
                int days = doc["days"] | 14;
                scheduleEngine.startAcclimation(schedId, startPct, days);
            } else if (action == "cancel") {
                scheduleEngine.cancelAcclimation();
            }
            stateDirty = true;
        }
    } else if (cmd == "time") {
        // Fallback direct time push from mobile app
        if (!err && (doc["time"].is<const char*>() || doc["iso"].is<const char*>())) {
            String timeIso = doc["time"].is<const char*>() ? doc["time"].as<String>() : doc["iso"].as<String>();
            rtcManager.setTimeFromISO(timeIso);
            stateDirty = true;
        }
    } else if (cmd == "ota") {
        if (!err) {
            if (!doc["url"].is<const char*>() || !doc["token"].is<const char*>() || !doc["sha256"].is<const char*>()) {
                Serial.println("[MQTT ERROR] Rejected OTA command: 'url', 'token', and 'sha256' are all mandatory.");
            } else {
                String url = doc["url"].as<String>();
                String token = doc["token"].as<String>();
                String sha256 = doc["sha256"].as<String>();
                Serial.printf("[MQTT] Authorized OTA update requested from %s\n", url.c_str());
                otaManager.startOtaUpdate(url, token, sha256);
            }
        }
    }
}
