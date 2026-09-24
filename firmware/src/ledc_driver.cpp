#include "ledc_driver.h"

LedcDriver ledcDriver;

LedcDriver::LedcDriver() 
    : initialized(false), masterOn(true), fanInverted(LEDC_FAN_INVERTED_DEFAULT), softStartActive(true), bootMillis(0),
      blueAttached(false), whiteAttached(false), uvAttached(false) {
    targetValues = {0.0f, 0.0f, 0.0f, 0.0f};
    appliedValues = {0.0f, 0.0f, 0.0f, 0.0f};
}

void LedcDriver::begin() {
    bootMillis = millis();
    softStartActive = true;

    // Hold LED driver pins strictly at pure DC HIGH (0% light) via standard GPIO output.
    // We intentionally DO NOT attach LEDC PWM until actual brightness > 0% is commanded.
    // This completely prevents any peripheral initialization duty glitches or boot flashes.
    digitalWrite(PIN_LED_BLUE1, HIGH);
    pinMode(PIN_LED_BLUE1, OUTPUT);
    digitalWrite(PIN_LED_BLUE2, HIGH);
    pinMode(PIN_LED_BLUE2, OUTPUT);
    digitalWrite(PIN_LED_WHITE, HIGH);
    pinMode(PIN_LED_WHITE, OUTPUT);
    digitalWrite(PIN_LED_UV, HIGH);
    pinMode(PIN_LED_UV, OUTPUT);

    blueAttached = false;
    whiteAttached = false;
    uvAttached = false;

    // Configure LEDC timers in advance so they are ready when channels attach
    ledcSetup(LEDC_CHANNEL_BLUE1, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcSetup(LEDC_CHANNEL_BLUE2, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcSetup(LEDC_CHANNEL_WHITE, LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);
    ledcSetup(LEDC_CHANNEL_UV,    LEDC_LED_FREQ_HZ, LEDC_LED_RESOLUTION);

    // Configure Fan channel (1000 Hz, 8-bit on GPIO 4) - start at 0% (OFF)
    ledcSetup(LEDC_CHANNEL_FAN, LEDC_FAN_FREQ_HZ, LEDC_FAN_RESOLUTION);
    ledcWrite(LEDC_CHANNEL_FAN, pctToFanDuty(0.0f));
    ledcAttachPin(PIN_FAN_PWM, LEDC_CHANNEL_FAN);

    // Initial safe state: Start all lights at 0.0% to completely eliminate boot flashes
    targetValues = {0.0f, 0.0f, 0.0f, 0.0f};
    appliedValues = {0.0f, 0.0f, 0.0f, 0.0f};

    initialized = true;
}

uint32_t LedcDriver::pctToLedDuty(float pct) {
#if defined(LEDC_PWM_INVERTED) && LEDC_PWM_INVERTED
    if (pct <= 0.5f) return LEDC_LED_MAX_DUTY; // Below 0.5% completely off (pure DC HIGH, optocoupler saturated)
    if (pct >= 100.0f) return 0;
    float inv = 100.0f - pct;
    return (uint32_t)((inv / 100.0f) * (float)LEDC_LED_MAX_DUTY + 0.5f);
#else
    if (pct <= 0.5f) return 0;
    if (pct >= 100.0f) return LEDC_LED_MAX_DUTY;
    return (uint32_t)((pct / 100.0f) * (float)LEDC_LED_MAX_DUTY + 0.5f);
#endif
}

uint32_t LedcDriver::pctToFanDuty(float pct) {
    pct = constrain(pct, 0.0f, 100.0f);
    if (fanInverted) {
        // Active-low optocoupler: 0% = pure DC HIGH (255, OFF), 100% = pure DC LOW (0, FULL ON)
        if (pct <= 0.0f) return LEDC_FAN_MAX_DUTY;
        if (pct >= 100.0f) return 0;
        float inv = 100.0f - pct;
        return (uint32_t)((inv / 100.0f) * (float)LEDC_FAN_MAX_DUTY + 0.5f);
    } else {
        // Active-high logic FET: 0% = pure DC LOW (0, OFF), 100% = pure DC HIGH (255, FULL ON)
        if (pct <= 0.0f) return 0;
        if (pct >= 100.0f) return LEDC_FAN_MAX_DUTY;
        return (uint32_t)((pct / 100.0f) * (float)LEDC_FAN_MAX_DUTY + 0.5f);
    }
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

void LedcDriver::setFanInverted(bool inverted) {
    fanInverted = inverted;
    if (initialized) {
        ledcWrite(LEDC_CHANNEL_FAN, pctToFanDuty(appliedValues.fan));
    }
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

    ChannelValues effectiveTarget = masterOn ? targetValues : ChannelValues{0.0f, 0.0f, 0.0f, 0.0f};

    appliedValues.blue  = stepValue(appliedValues.blue,  effectiveTarget.blue);
    appliedValues.white = stepValue(appliedValues.white, effectiveTarget.white);
    appliedValues.uv    = stepValue(appliedValues.uv,    effectiveTarget.uv);
    appliedValues.fan   = stepValue(appliedValues.fan,   effectiveTarget.fan);

    applyOutputs();
}

void LedcDriver::applyOutputs() {
    if (!masterOn) {
        if (blueAttached) {
            ledcDetachPin(PIN_LED_BLUE1);
            ledcDetachPin(PIN_LED_BLUE2);
            blueAttached = false;
        }
        if (whiteAttached) {
            ledcDetachPin(PIN_LED_WHITE);
            whiteAttached = false;
        }
        if (uvAttached) {
            ledcDetachPin(PIN_LED_UV);
            uvAttached = false;
        }
        digitalWrite(PIN_LED_BLUE1, HIGH);
        pinMode(PIN_LED_BLUE1, OUTPUT);
        digitalWrite(PIN_LED_BLUE2, HIGH);
        pinMode(PIN_LED_BLUE2, OUTPUT);
        digitalWrite(PIN_LED_WHITE, HIGH);
        pinMode(PIN_LED_WHITE, OUTPUT);
        digitalWrite(PIN_LED_UV, HIGH);
        pinMode(PIN_LED_UV, OUTPUT);

        appliedValues.blue  = 0.0f;
        appliedValues.white = 0.0f;
        appliedValues.uv    = 0.0f;
        appliedValues.fan   = 0.0f;
    } else {
        // Royal Blue channels (GPIO 18 & 19)
        if (appliedValues.blue <= 0.01f) {
            if (blueAttached) {
                ledcDetachPin(PIN_LED_BLUE1);
                ledcDetachPin(PIN_LED_BLUE2);
                blueAttached = false;
            }
            digitalWrite(PIN_LED_BLUE1, HIGH);
            pinMode(PIN_LED_BLUE1, OUTPUT);
            digitalWrite(PIN_LED_BLUE2, HIGH);
            pinMode(PIN_LED_BLUE2, OUTPUT);
        } else {
            uint32_t blueDuty = pctToLedDuty(appliedValues.blue);
            if (!blueAttached) {
                ledcAttachPin(PIN_LED_BLUE1, LEDC_CHANNEL_BLUE1);
                ledcAttachPin(PIN_LED_BLUE2, LEDC_CHANNEL_BLUE2);
                blueAttached = true;
            }
            ledcWrite(LEDC_CHANNEL_BLUE1, blueDuty);
            ledcWrite(LEDC_CHANNEL_BLUE2, blueDuty);
        }

        // Day White channel (GPIO 32)
        if (appliedValues.white <= 0.01f) {
            if (whiteAttached) {
                ledcDetachPin(PIN_LED_WHITE);
                whiteAttached = false;
            }
            digitalWrite(PIN_LED_WHITE, HIGH);
            pinMode(PIN_LED_WHITE, OUTPUT);
        } else {
            uint32_t whiteDuty = pctToLedDuty(appliedValues.white);
            if (!whiteAttached) {
                ledcAttachPin(PIN_LED_WHITE, LEDC_CHANNEL_WHITE);
                whiteAttached = true;
            }
            ledcWrite(LEDC_CHANNEL_WHITE, whiteDuty);
        }

        // Actinic UV channel (GPIO 33)
        if (appliedValues.uv <= 0.01f) {
            if (uvAttached) {
                ledcDetachPin(PIN_LED_UV);
                uvAttached = false;
            }
            digitalWrite(PIN_LED_UV, HIGH);
            pinMode(PIN_LED_UV, OUTPUT);
        } else {
            uint32_t uvDuty = pctToLedDuty(appliedValues.uv);
            if (!uvAttached) {
                ledcAttachPin(PIN_LED_UV, LEDC_CHANNEL_UV);
                uvAttached = true;
            }
            ledcWrite(LEDC_CHANNEL_UV, uvDuty);
        }
    }

    ledcWrite(LEDC_CHANNEL_FAN, pctToFanDuty(appliedValues.fan));
}

ChannelValues LedcDriver::getAppliedValues() const {
    return appliedValues;
}

ChannelValues LedcDriver::getTargetValues() const {
    return targetValues;
}
