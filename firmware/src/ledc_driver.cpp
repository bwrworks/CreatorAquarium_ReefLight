#include "ledc_driver.h"

LedcDriver ledcDriver;

LedcDriver::LedcDriver() 
    : initialized(false), masterOn(true), softStartActive(true), bootMillis(0) {
    targetValues = {10.0f, 10.0f, 10.0f, 80.0f};
    appliedValues = {10.0f, 10.0f, 10.0f, 80.0f};
}

void LedcDriver::begin() {
    bootMillis = millis();
    softStartActive = true;

    // Configure Royal Blue 1 (GPIO 18) and Royal Blue 2 (GPIO 19)
    ledcSetup(LEDC_CHANNEL_BLUE1, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_BLUE1, LEDC_CHANNEL_BLUE1);

    ledcSetup(LEDC_CHANNEL_BLUE2, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_BLUE2, LEDC_CHANNEL_BLUE2);

    // Configure Day White (GPIO 32)
    ledcSetup(LEDC_CHANNEL_WHITE, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_WHITE, LEDC_CHANNEL_WHITE);

    // Configure Actinic UV (GPIO 33)
    ledcSetup(LEDC_CHANNEL_UV, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcAttachPin(PIN_LED_UV, LEDC_CHANNEL_UV);

    // Configure Fan channel (25kHz, 8-bit on GPIO 4)
    ledcSetup(LEDC_CHANNEL_FAN, LEDC_FAN_FREQ_HZ, LEDC_FAN_RESOLUTION);
    ledcAttachPin(PIN_FAN_PWM, LEDC_CHANNEL_FAN);

    // Initial safe state: Start all lights at absolute 10% soft-start to protect fish and LEDs
    targetValues = {10.0f, 10.0f, 10.0f, 80.0f};
    appliedValues = {10.0f, 10.0f, 10.0f, 80.0f};

    uint32_t bootDuty = pctToLedDuty(10.0f);
    ledcWrite(LEDC_CHANNEL_BLUE1, bootDuty);
    ledcWrite(LEDC_CHANNEL_BLUE2, bootDuty);
    ledcWrite(LEDC_CHANNEL_WHITE, bootDuty);
    ledcWrite(LEDC_CHANNEL_UV,    bootDuty);

    // Fan spins safely at 80% on boot
    ledcWrite(LEDC_CHANNEL_FAN, pctToFanDuty(80.0f));
    initialized = true;
}

uint32_t LedcDriver::pctToLedDuty(float pct) {
#if defined(LEDC_PWM_INVERTED) && LEDC_PWM_INVERTED
    if (pct <= 0.0f) return LEDC_LED_MAX_DUTY;
    if (pct >= 100.0f) return 0;
    float inv = 100.0f - pct;
    return (uint32_t)((inv / 100.0f) * (float)LEDC_LED_MAX_DUTY + 0.5f);
#else
    if (pct <= 0.0f) return 0;
    if (pct >= 100.0f) return LEDC_LED_MAX_DUTY;
    return (uint32_t)((pct / 100.0f) * (float)LEDC_LED_MAX_DUTY + 0.5f);
#endif
}

uint32_t LedcDriver::pctToFanDuty(float pct) {
    if (pct <= 0.0f) return 0; // 0% = Motor completely stopped
    if (pct >= 100.0f) return LEDC_FAN_MAX_DUTY;
    // Map 1%..100% user range to 30%..100% hardware duty so motor never stalls
    float effectivePct = 30.0f + (pct / 100.0f) * 70.0f;
    return (uint32_t)((effectivePct / 100.0f) * (float)LEDC_FAN_MAX_DUTY + 0.5f);
}

void LedcDriver::setChannels(float blue, float white, float uv) {
    targetValues.blue  = constrain(blue, 0.0f, 100.0f);
    targetValues.white = constrain(white, 0.0f, 100.0f);
    targetValues.uv    = constrain(uv, 0.0f, 100.0f);
    // Ramps smoothly via updateSlew() to protect fish and LEDs
}

void LedcDriver::setFan(float fan) {
    targetValues.fan = constrain(fan, 0.0f, 100.0f);
    appliedValues.fan = targetValues.fan;
    ledcWrite(LEDC_CHANNEL_FAN, pctToFanDuty(targetValues.fan));
}

void LedcDriver::setMasterOn(bool enabled) {
    masterOn = enabled;
    if (!masterOn) {
        applyOutputs(); // Immediately shut down if master kill switch turned OFF
    }
}

void LedcDriver::updateSlew(float maxDeltaPercent) {
    if (!initialized) return;

    // Boot Acclimation / Soft-start logic:
    // First 60 seconds after boot, ramp gently at ~0.15% per 100ms (~1.5% per sec, ~50-60s to target)
    float effectiveDelta = maxDeltaPercent;
    if (softStartActive) {
        if (millis() - bootMillis < 60000UL) {
            effectiveDelta = 0.15f; // 0.15% per 100ms -> gentle 50-60s ramp
        } else {
            softStartActive = false;
        }
    }

    auto stepValue = [effectiveDelta](float current, float target) -> float {
        if (fabs(current - target) <= effectiveDelta) {
            return target;
        }
        return (current < target) ? (current + effectiveDelta) : (current - effectiveDelta);
    };

    ChannelValues effectiveTarget = masterOn ? targetValues : ChannelValues{0.0f, 0.0f, 0.0f, targetValues.fan};

    appliedValues.blue  = stepValue(appliedValues.blue,  effectiveTarget.blue);
    appliedValues.white = stepValue(appliedValues.white, effectiveTarget.white);
    appliedValues.uv    = stepValue(appliedValues.uv,    effectiveTarget.uv);
    appliedValues.fan   = stepValue(appliedValues.fan,   effectiveTarget.fan);

    uint32_t blueDuty = pctToLedDuty(appliedValues.blue);
    ledcWrite(LEDC_CHANNEL_BLUE1, blueDuty);
    ledcWrite(LEDC_CHANNEL_BLUE2, blueDuty);
    ledcWrite(LEDC_CHANNEL_WHITE, pctToLedDuty(appliedValues.white));
    ledcWrite(LEDC_CHANNEL_UV,    pctToLedDuty(appliedValues.uv));
    ledcWrite(LEDC_CHANNEL_FAN,   pctToFanDuty(appliedValues.fan));
}

void LedcDriver::applyOutputs() {
    if (!masterOn) {
#if defined(LEDC_PWM_INVERTED) && LEDC_PWM_INVERTED
        ledcWrite(LEDC_CHANNEL_BLUE1, LEDC_LED_MAX_DUTY);
        ledcWrite(LEDC_CHANNEL_BLUE2, LEDC_LED_MAX_DUTY);
        ledcWrite(LEDC_CHANNEL_WHITE, LEDC_LED_MAX_DUTY);
        ledcWrite(LEDC_CHANNEL_UV,    LEDC_LED_MAX_DUTY);
#else
        ledcWrite(LEDC_CHANNEL_BLUE1, 0);
        ledcWrite(LEDC_CHANNEL_BLUE2, 0);
        ledcWrite(LEDC_CHANNEL_WHITE, 0);
        ledcWrite(LEDC_CHANNEL_UV,    0);
#endif
        appliedValues.blue  = 0.0f;
        appliedValues.white = 0.0f;
        appliedValues.uv    = 0.0f;
    } else {
        uint32_t blueDuty = pctToLedDuty(appliedValues.blue);
        ledcWrite(LEDC_CHANNEL_BLUE1, blueDuty);
        ledcWrite(LEDC_CHANNEL_BLUE2, blueDuty);
        ledcWrite(LEDC_CHANNEL_WHITE, pctToLedDuty(appliedValues.white));
        ledcWrite(LEDC_CHANNEL_UV,    pctToLedDuty(appliedValues.uv));
    }

    ledcWrite(LEDC_CHANNEL_FAN, pctToFanDuty(appliedValues.fan));
}

ChannelValues LedcDriver::getAppliedValues() const {
    return appliedValues;
}

ChannelValues LedcDriver::getTargetValues() const {
    return targetValues;
}
