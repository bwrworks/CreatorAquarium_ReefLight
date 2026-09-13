#pragma once

// =========================================================================
// Firmware Secrets Template (Tracked in Git)
// Copy this file to "secrets.h" and insert your real production secrets.
// "secrets.h" is strictly gitignored and must NEVER be committed.
// =========================================================================

#define OTA_SECRET_TOKEN          "REPLACE_WITH_SECURE_RANDOM_TOKEN_HERE"

#define DEFAULT_MQTT_HOST         "your-broker-id.s1.eu.hivemq.cloud"
#define DEFAULT_MQTT_USER         "your_mqtt_username"
#define DEFAULT_MQTT_PASS         "your_mqtt_password"
