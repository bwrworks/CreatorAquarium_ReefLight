#include "ledc_driver.h"

LedcDriver ledcDriver;

LedcDriver::LedcDriver() 
    : masterOn(true) {
    targetValues = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
    appliedValues = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
}

void LedcDriver::begin() {
    // Configure 4 LED channels (5kHz, 13-bit)
    ledcSetup(LEDC_CHANNEL_BLUE, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_BLUE, LEDC_CHANNEL_BLUE);

    ledcSetup(LEDC_CHANNEL_RED, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_RED, LEDC_CHANNEL_RED);

    ledcSetup(LEDC_CHANNEL_WHITE, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_WHITE, LEDC_CHANNEL_WHITE);

    ledcSetup(LEDC_CHANNEL_UV, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_UV, LEDC_CHANNEL_UV);

    // Configure Fan channel (25kHz, 8-bit)
    ledcSetup(LEDC_CHANNEL_FAN, LEDC_FAN_FREQ_HZ, LEDC_FAN_RESOLUTION);
    ledcAttachPin(PIN_FAN_PWM, LEDC_CHANNEL_FAN);

    // Initial state: 0%
    applyOutputs();
}

uint32_t LedcDriver::pctToLedDuty(float pct) {
    if (pct <= 0.0f) return 0;
    if (pct >= 100.0f) return LEDC_LED_MAX_DUTY;
    // Direct linear mapping with 13-bit depth (0 - 8191)
    return (uint32_t)((pct / 100.0f) * (float)LEDC_LED_MAX_DUTY + 0.5f);
}

uint32_t LedcDriver::pctToFanDuty(float pct) {
    if (pct <= 0.0f) return 0;
    if (pct >= 100.0f) return LEDC_FAN_MAX_DUTY;
    return (uint32_t)((pct / 100.0f) * (float)LEDC_FAN_MAX_DUTY + 0.5f);
}

void LedcDriver::setChannels(float blue, float white, float red, float uv) {
    targetValues.blue  = constrain(blue, 0.0f, 100.0f);
    targetValues.white = constrain(white, 0.0f, 100.0f);
    targetValues.red   = constrain(red, 0.0f, 100.0f);
    targetValues.uv    = constrain(uv, 0.0f, 100.0f);
    applyOutputs();
}

void LedcDriver::setFan(float fan) {
    targetValues.fan = constrain(fan, 0.0f, 100.0f);
    applyOutputs();
}

void LedcDriver::setMasterOn(bool enabled) {
    masterOn = enabled;
    applyOutputs();
}

void LedcDriver::applyOutputs() {
    if (!masterOn) {
        // Master off forces all LEDs to zero output without modifying target values
        ledcWrite(LEDC_CHANNEL_BLUE,  0);
        ledcWrite(LEDC_CHANNEL_RED,   0);
        ledcWrite(LEDC_CHANNEL_WHITE, 0);
        ledcWrite(LEDC_CHANNEL_UV,    0);
        appliedValues.blue = 0.0f;
        appliedValues.red = 0.0f;
        appliedValues.white = 0.0f;
        appliedValues.uv = 0.0f;
    } else {
        ledcWrite(LEDC_CHANNEL_BLUE,  pctToLedDuty(targetValues.blue));
        ledcWrite(LEDC_CHANNEL_RED,   pctToLedDuty(targetValues.red));
        ledcWrite(LEDC_CHANNEL_WHITE, pctToLedDuty(targetValues.white));
        ledcWrite(LEDC_CHANNEL_UV,    pctToLedDuty(targetValues.uv));
        appliedValues.blue  = targetValues.blue;
        appliedValues.red   = targetValues.red;
        appliedValues.white = targetValues.white;
        appliedValues.uv    = targetValues.uv;
    }

    // Fan is not cut off by master switch for thermal safety
    ledcWrite(LEDC_CHANNEL_FAN, pctToFanDuty(targetValues.fan));
    appliedValues.fan = targetValues.fan;
}

ChannelValues LedcDriver::getAppliedValues() const {
    return appliedValues;
}

ChannelValues LedcDriver::getTargetValues() const {
    return targetValues;
}
