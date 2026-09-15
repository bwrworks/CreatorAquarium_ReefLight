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
#define PIN_LED_BLUE     18  // Blue channel
#define PIN_LED_RED      19  // Red channel
#define PIN_LED_WHITE    32  // White channel
#define PIN_LED_UV       33  // UV channel
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
// Display Configuration: 1.44" ST7735 SPI TFT Color Display (128x128)
// =========================================================================
#define TFT_CS                 5   // Chip select
#define TFT_RST                17  // Reset
#define TFT_DC                 16  // A0 / Data/Command
#define TFT_MOSI               23  // DI / SDA
#define TFT_SCLK               27  // CK / SCK
#define TFT_LED                26  // Backlight pin (onboard R1 current limited)
#define TFT_WIDTH              128
#define TFT_HEIGHT             128

// ST7735 Initialization Variant (INITR_144GREENTAB for 1.44" 128x128, or INITR_REDTAB / INITR_BLACKTAB)
#ifndef TFT_INIT_VARIANT
#define TFT_INIT_VARIANT       INITR_144GREENTAB
#endif

// Display Orientation (0: default, 1: 90 deg, 2: 180 deg, 3: 270 deg)
#ifndef TFT_ROTATION
#define TFT_ROTATION           0
#endif

// Display Color Inversion (set to true if colors appear inverted)
#ifndef TFT_INVERT
#define TFT_INVERT             false
#endif

// Legacy OLED settings kept for backward compatibility if needed
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

// PWM Polarity: active-low LED drivers (e.g. optocouplers, inverted DIM, pull-up stages)
// When true: 0% brightness = LEDC_LED_MAX_DUTY (OFF), 100% brightness = 0 (FULL ON)
#define LEDC_PWM_INVERTED      true

// Allowed OTA domain list (comma-separated, lowercased)
#define DEFAULT_ALLOWED_OTA_HOSTS "github.com,raw.githubusercontent.com,bwrworks.github.io,reeflight.vercel.app"

#define FIRMWARE_VERSION       "1.2.1"

// LittleFS Paths
#define STORAGE_SCHEDULES_DIR  "/schedules"
#define STORAGE_WEEKLY_PATH    "/weekly.json"
