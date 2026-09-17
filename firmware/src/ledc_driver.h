#pragma once

#include <Arduino.h>
#include "../include/config.h"

struct ChannelValues {
    float blue;   // 0.0 - 100.0% (10x Royal Blue across GPIO 18 & 19)
    float white;  // 0.0 - 100.0% (4x Day White on GPIO 32)
    float uv;     // 0.0 - 100.0% (2x Actinic UV on GPIO 33)
    float fan;    // 0.0 - 100.0%
};

class LedcDriver {
public:
    LedcDriver();
    void begin();
    
    // Set channel percentage 0.0 - 100.0
    void setChannels(float blue, float white, float uv);
    void setFan(float fan);
    void setMasterOn(bool enabled);
    bool isMasterOn() const { return masterOn; }
    bool isInitialized() const { return initialized; }

    // Direct access to current applied values
    ChannelValues getAppliedValues() const;
    ChannelValues getTargetValues() const;

    // Smooth soft-start / ramp slew rate update (0% to target on power-on / wake)
    void updateSlew(float maxDeltaPercent = 0.5f);
    bool isSoftStartActive() const { return softStartActive; }
    void disableSoftStart() { softStartActive = false; }

private:
    bool initialized;
    bool masterOn;
    bool softStartActive;
    unsigned long bootMillis;
    ChannelValues targetValues;
    ChannelValues appliedValues;

    uint32_t pctToLedDuty(float pct);
    uint32_t pctToFanDuty(float pct);
    void applyOutputs();
};

extern LedcDriver ledcDriver;
