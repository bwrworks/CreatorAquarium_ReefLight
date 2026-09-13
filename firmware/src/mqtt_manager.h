#pragma once

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "../include/config.h"
#include "schedule_engine.h"

class MqttManager {
public:
    MqttManager();
    void begin(const char* brokerHost, uint16_t port, const char* user, const char* pass, const char* deviceId);
    
    // FreeRTOS Task function on Core 0
    static void taskFunction(void* param);

    void loop();
    bool isConnected();
    void publishState();
    void requestPublishState() { stateDirty = true; }

private:
    WiFiClientSecure secureClient;
    PubSubClient mqttClient;

    String broker;
    uint16_t brokerPort;
    String username;
    String password;
    String devId;

    String topicState;
    String topicStatus;
    String topicCmdWildcard;

    unsigned long lastReconnectAttempt;
    unsigned long reconnectInterval;
    unsigned long lastHeartbeatMillis;
    bool stateDirty;

    void connectToBroker();
    void handleIncomingMessage(char* topic, byte* payload, unsigned int length);
    void setupTopics();
};

extern MqttManager mqttManager;
