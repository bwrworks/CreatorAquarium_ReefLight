#pragma once

#include <Arduino.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <vector>
#include "../include/config.h"

struct KeyframeData {
    int timeSec;  // seconds from 00:00 (0 - 86399)
    String timeStr; // "HH:MM"
    float blue;
    float white;
    float red;
    float uv;
};

struct ScheduleData {
    String id;
    String name;
    std::vector<KeyframeData> keyframes;
};

struct WeeklyAssignmentData {
    String mon;
    String tue;
    String wed;
    String thu;
    String fri;
    String sat;
    String sun;
};

struct AcclimationData {
    bool active;
    String scheduleId;
    float startPct;
    int daysTotal;
    String startedAt; // ISO timestamp
};

class StorageManager {
public:
    StorageManager();
    bool begin();
    bool isMounted() const { return mounted; }

    // Schedule Operations
    bool saveSchedule(const String& jsonStr);
    bool deleteSchedule(const String& id);
    bool loadSchedule(const String& id, ScheduleData& outSchedule);
    std::vector<String> listScheduleIds();
    String getScheduleJson(const String& id);

    // Weekly Assignment Operations
    bool saveWeeklyAssignment(const String& jsonStr);
    bool loadWeeklyAssignment(WeeklyAssignmentData& outWeekly);
    String getWeeklyAssignmentJson();

    // Acclimation Operations (stored in NVS)
    bool saveAcclimation(const AcclimationData& acc);
    bool loadAcclimation(AcclimationData& outAcc);

    // Settings (Preferences NVS)
    int getOverrideTimeout();
    void setOverrideTimeout(int seconds);

    long getTimezoneOffset();
    void setTimezoneOffset(long offsetSec);

    int getDisplayBrightness();
    void setDisplayBrightness(int brightness);

    void saveLastKnownOutputs(float b, float w, float r, float uv, float fan);
    void loadLastKnownOutputs(float& b, float& w, float& r, float& uv, float& fan);

    // OTA Boot Health tracking
    bool isBootConfirmed();
    void markBootConfirmed();
    void markBootPending();

private:
    bool mounted;
    Preferences prefs;
    void seedDefaultData();
};

extern StorageManager storageManager;
