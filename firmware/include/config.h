#pragma once

#include <Arduino.h>

// =========================================================================
// Secrets Inclusion with Compile-Time Enforcement
// =========================================================================
#if __has_include("secrets.h")
    #include "secrets.h"
#else
    #error "CRITICAL: 'firmware/include/secrets.h' is missing! Copy 'secrets.example.h' to 'secrets.h' and define production tokens."
#endif

#if !defined(OTA_SECRET_TOKEN)
    #error "OTA_SECRET_TOKEN is not defined. Copy secrets.example.h to secrets.h and fill in real values."
#endif

#include "certificates.h"

// =========================================================================
// Hardware Pinout Baseline (SRS §3)
// =========================================================================
#define PIN_LED_BLUE     32  // 6 LEDs, Blue channel
#define PIN_LED_RED      33  // 2 LEDs, Red channel
#define PIN_LED_WHITE    18  // 4 LEDs, White channel
#define PIN_LED_UV       19  // 2 LEDs, UV channel
#define PIN_FAN_PWM       4  // 1 Electronics cooling fan

#define PIN_I2C_SDA      21  // Shared I2C SDA for DS3231 RTC & SSD1306 OLED
#define PIN_I2C_SCL      22  // Shared I2C SCL for DS3231 RTC & SSD1306 OLED

// =========================================================================
// PWM / LEDC Configuration (SRS NFR-8)
// =========================================================================
#define LEDC_LED_FREQ_HZ       5000
#define LEDC_LED_RESOLUTION    13
#define LEDC_LED_MAX_DUTY      ((1 << LEDC_LED_RESOLUTION) - 1) // 8191

#define LEDC_CHANNEL_BLUE      0
#define LEDC_CHANNEL_RED       1
#define LEDC_CHANNEL_WHITE     2
#define LEDC_CHANNEL_UV        3

#define LEDC_FAN_FREQ_HZ       25000
#define LEDC_FAN_RESOLUTION    8
#define LEDC_FAN_MAX_DUTY      ((1 << LEDC_FAN_RESOLUTION) - 1) // 255
#define LEDC_CHANNEL_FAN       4

// =========================================================================
// OLED Display Configuration
// =========================================================================
#define OLED_SCREEN_WIDTH      128
#define OLED_SCREEN_HEIGHT     64
#define OLED_I2C_ADDRESS       0x3C
#define OLED_PAGE_INTERVAL_MS  4000

// =========================================================================
// Default Cloud & MQTT Settings
// =========================================================================
#define DEFAULT_DEVICE_ID      "reef-esp32-01"
#define DEFAULT_MQTT_PORT      8883
#define DEFAULT_TIMEZONE       "Asia/Kolkata"
#define DEFAULT_TIMEZONE_OFFSET_SEC (5 * 3600 + 30 * 60) // UTC+5:30
#define DEFAULT_OVERRIDE_TIMEOUT_SEC 7200                // 2 hours

// Allowed OTA domain list (comma-separated, lowercased)
#define DEFAULT_ALLOWED_OTA_HOSTS "github.com,raw.githubusercontent.com,bwrworks.github.io"

#define FIRMWARE_VERSION       "1.1.0"

// LittleFS Paths
#define STORAGE_SCHEDULES_DIR  "/schedules"
#define STORAGE_WEEKLY_PATH    "/weekly.json"
