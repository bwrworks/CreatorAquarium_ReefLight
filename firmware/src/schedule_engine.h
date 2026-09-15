#pragma once

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "ledc_driver.h"
#include "rtc_time.h"
#include "storage_manager.h"

struct DeviceStateSnapshot {
    String mode;                     // "auto" | "manual"
    ChannelValues live;              // b, w, r, uv, fan
    String manualOverrideExpiresAt;  // ISO string or empty
    long manualOverrideRemainingSec; // Seconds remaining in manual override (0 if auto)
    String activeScheduleId;
    AcclimationData acclimation;
    int acclimationDaysElapsed;      // Actual computed elapsed days (e.g. 3)
    float acclimationCurrentScale;   // Actual computed current intensity scale (e.g. 62.5%)
    String time;
    bool wifiConnected;
    bool cloudConnected;
    String firmwareVersion;
    bool masterOn;
};

class ScheduleEngine {
public:
    ScheduleEngine();
    void begin();
    
    // FreeRTOS Task function running on Core 1
    static void taskFunction(void* param);

    // Schedule Engine Tick (called every 1s)
    void tick();

    // Mode & Manual overrides
    void setMode(const String& mode);
    void setManualChannels(float b, float w, float r, float uv);
    void setFan(float fanPct);
    void setMasterOn(bool on);

    // Force reload of active schedule / weekly map from storage
    void reloadConfig();

    // Acclimation control
    void startAcclimation(const String& scheduleId, float startPct, int days);
    void cancelAcclimation();

    // Thread-safe state snapshot for MQTT publishing / OLED display
    DeviceStateSnapshot getStateSnapshot(bool wifiConn, bool cloudConn);

    // Number of completed engine ticks (used for local health verification)
    uint32_t getTickCount() const { return tickCount; }

    // Mathematical interpolation function (exposed for unit testing)
    static ChannelValues interpolate(const std::vector<KeyframeData>& keyframes, int currentSecOfDay);

private:
    SemaphoreHandle_t mutex;
    String currentMode;              // "auto" or "manual"
    time_t manualOverrideUntilEpoch;
    ChannelValues manualValues;
    float currentFan;

    ScheduleData activeSchedule;
    WeeklyAssignmentData weekly;
    AcclimationData acclimation;
    String currentActiveScheduleId;

    unsigned long lastNvsSaveMillis;
    volatile uint32_t tickCount;

    void evaluateSchedule(int secOfDay);
    void resolveTodaySchedule();
    float computeAcclimationScale();
};

extern ScheduleEngine scheduleEngine;
