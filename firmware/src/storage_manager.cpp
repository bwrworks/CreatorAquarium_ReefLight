#include "storage_manager.h"
#include "rtc_time.h"

StorageManager storageManager;

static int parseTimeToSeconds(const char* timeStr) {
    int h = 0, m = 0;
    if (sscanf(timeStr, "%d:%d", &h, &m) == 2) {
        return (h * 3600) + (m * 60);
    }
    return 0;
}

StorageManager::StorageManager() : mounted(false) {}

bool StorageManager::begin() {
    prefs.begin("reef_cfg", false);

    if (!LittleFS.begin(true)) {
        Serial.println("[STORAGE] LittleFS Mount Failed. Formatting...");
        LittleFS.format();
        if (!LittleFS.begin(true)) {
            Serial.println("[STORAGE] LittleFS Critical Failure!");
            mounted = false;
            return false;
        }
    }

    mounted = true;

    if (!LittleFS.exists(STORAGE_SCHEDULES_DIR)) {
        LittleFS.mkdir(STORAGE_SCHEDULES_DIR);
    }

    if (!LittleFS.exists(STORAGE_WEEKLY_PATH) || !LittleFS.exists(String(STORAGE_SCHEDULES_DIR) + "/reef_growth_w1.json")) {
        seedDefaultData();
    }

    return true;
}

void StorageManager::seedDefaultData() {
    Serial.println("[STORAGE] Seeding Reef Growth multi-week schedules and weekly assignment...");

    // Remove legacy schedule files
    deleteSchedule("natural_reef");
    deleteSchedule("deep_coral_pop");

    // Week 1 Schedule: 15:30 to 21:30
    const char* reefGrowthW1Json = R"json({
  "id": "reef_growth_w1",
  "name": "Reef Growth (Week 1)",
  "keyframes": [
    { "time": "00:00", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:29", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:30", "blue": 1, "white": 0, "uv": 0 },
    { "time": "16:00", "blue": 7, "white": 2, "uv": 2 },
    { "time": "16:30", "blue": 13, "white": 5, "uv": 4 },
    { "time": "17:00", "blue": 20, "white": 12, "uv": 6 },
    { "time": "20:00", "blue": 20, "white": 12, "uv": 6 },
    { "time": "20:30", "blue": 13, "white": 5, "uv": 4 },
    { "time": "21:00", "blue": 7, "white": 2, "uv": 2 },
    { "time": "21:30", "blue": 0, "white": 0, "uv": 0 },
    { "time": "23:59", "blue": 0, "white": 0, "uv": 0 }
  ]
})json";
    saveSchedule(String(reefGrowthW1Json));

    // Week 2 Schedule: 15:30 to 21:30
    const char* reefGrowthW2Json = R"json({
  "id": "reef_growth_w2",
  "name": "Reef Growth (Week 2)",
  "keyframes": [
    { "time": "00:00", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:29", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:30", "blue": 2, "white": 0, "uv": 0 },
    { "time": "16:00", "blue": 8, "white": 2, "uv": 3 },
    { "time": "16:30", "blue": 17, "white": 7, "uv": 5 },
    { "time": "17:00", "blue": 25, "white": 15, "uv": 8 },
    { "time": "20:00", "blue": 25, "white": 15, "uv": 8 },
    { "time": "20:30", "blue": 17, "white": 7, "uv": 5 },
    { "time": "21:00", "blue": 8, "white": 2, "uv": 3 },
    { "time": "21:30", "blue": 0, "white": 0, "uv": 0 },
    { "time": "23:59", "blue": 0, "white": 0, "uv": 0 }
  ]
})json";
    saveSchedule(String(reefGrowthW2Json));

    // Week 3 Schedule: 15:30 to 21:30
    const char* reefGrowthW3Json = R"json({
  "id": "reef_growth_w3",
  "name": "Reef Growth (Week 3+)",
  "keyframes": [
    { "time": "00:00", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:29", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:30", "blue": 2, "white": 0, "uv": 0 },
    { "time": "16:00", "blue": 10, "white": 3, "uv": 3 },
    { "time": "16:30", "blue": 20, "white": 8, "uv": 6 },
    { "time": "17:00", "blue": 30, "white": 18, "uv": 10 },
    { "time": "20:00", "blue": 30, "white": 18, "uv": 10 },
    { "time": "20:30", "blue": 20, "white": 8, "uv": 6 },
    { "time": "21:00", "blue": 10, "white": 3, "uv": 3 },
    { "time": "21:30", "blue": 0, "white": 0, "uv": 0 },
    { "time": "23:59", "blue": 0, "white": 0, "uv": 0 }
  ]
})json";
    saveSchedule(String(reefGrowthW3Json));

    // Base reef_growth alias (defaults to Week 1 initial)
    const char* reefGrowthJson = R"json({
  "id": "reef_growth",
  "name": "Reef Growth (Auto)",
  "keyframes": [
    { "time": "00:00", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:29", "blue": 0, "white": 0, "uv": 0 },
    { "time": "15:30", "blue": 1, "white": 0, "uv": 0 },
    { "time": "16:00", "blue": 7, "white": 2, "uv": 2 },
    { "time": "16:30", "blue": 13, "white": 5, "uv": 4 },
    { "time": "17:00", "blue": 20, "white": 12, "uv": 6 },
    { "time": "20:00", "blue": 20, "white": 12, "uv": 6 },
    { "time": "20:30", "blue": 13, "white": 5, "uv": 4 },
    { "time": "21:00", "blue": 7, "white": 2, "uv": 2 },
    { "time": "21:30", "blue": 0, "white": 0, "uv": 0 },
    { "time": "23:59", "blue": 0, "white": 0, "uv": 0 }
  ]
})json";
    saveSchedule(String(reefGrowthJson));

    // Default weekly assignment: all 7 days set to "reef_growth"
    const char* defaultWeeklyJson = R"json({
  "mon": "reef_growth",
  "tue": "reef_growth",
  "wed": "reef_growth",
  "thu": "reef_growth",
  "fri": "reef_growth",
  "sat": "reef_growth",
  "sun": "reef_growth"
})json";

    saveWeeklyAssignment(String(defaultWeeklyJson));
}

bool StorageManager::saveSchedule(const String& jsonStr) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, jsonStr);
    if (error) {
        Serial.printf("[STORAGE] Failed to parse schedule JSON: %s\n", error.c_str());
        return false;
    }

    const char* id = doc["id"];
    if (!id || strlen(id) == 0) {
        Serial.println("[STORAGE] Schedule missing 'id'");
        return false;
    }

    String path = String(STORAGE_SCHEDULES_DIR) + "/" + id + ".json";
    File f = LittleFS.open(path.c_str(), "w");
    if (!f) {
        Serial.printf("[STORAGE] Failed to open file for writing: %s\n", path.c_str());
        return false;
    }

    serializeJson(doc, f);
    f.close();
    Serial.printf("[STORAGE] Schedule '%s' saved successfully\n", id);
    return true;
}

bool StorageManager::deleteSchedule(const String& id) {
    String path = String(STORAGE_SCHEDULES_DIR) + "/" + id + ".json";
    if (LittleFS.exists(path.c_str())) {
        return LittleFS.remove(path.c_str());
    }
    return false;
}

bool StorageManager::loadSchedule(const String& id, ScheduleData& outSchedule) {
    if (id == "natural_reef") {
        return loadSchedule("reef_growth", outSchedule);
    }

    if (id == "reef_growth") {
        // Multi-week Reef Growth progression
        // Start week 1: Sep 20, 2026 (epoch 1789862400)
        // Week 2: Sep 27, 2026 (+ 7 days = 1790467200)
        // Week 3+: Oct 04, 2026 (+ 14 days = 1791072000)
        time_t nowSec = rtcManager.getEpoch();
        String activeWeekId = "reef_growth_w1";
        if (nowSec >= 1791072000ULL) {
            activeWeekId = "reef_growth_w3";
        } else if (nowSec >= 1790467200ULL) {
            activeWeekId = "reef_growth_w2";
        } else {
            activeWeekId = "reef_growth_w1";
        }

        if (loadSchedule(activeWeekId, outSchedule)) {
            outSchedule.id = "reef_growth";
            outSchedule.name = (activeWeekId == "reef_growth_w3") ? "Reef Growth (Week 3+)" :
                               (activeWeekId == "reef_growth_w2") ? "Reef Growth (Week 2)" :
                                                                    "Reef Growth (Week 1)";
            return true;
        }
    }

    String path = String(STORAGE_SCHEDULES_DIR) + "/" + id + ".json";
    if (!LittleFS.exists(path.c_str())) {
        Serial.printf("[STORAGE] Schedule file not found: %s\n", path.c_str());
        return false;
    }

    File f = LittleFS.open(path.c_str(), "r");
    if (!f) return false;

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, f);
    f.close();

    if (error) {
        Serial.printf("[STORAGE] Error parsing schedule file: %s\n", error.c_str());
        return false;
    }

    outSchedule.id = doc["id"].as<String>();
    outSchedule.name = doc["name"].as<String>();
    outSchedule.keyframes.clear();

    JsonArray kfArray = doc["keyframes"].as<JsonArray>();
    for (JsonObject kf : kfArray) {
        KeyframeData k;
        k.timeStr = kf["time"].as<String>();
        k.timeSec = parseTimeToSeconds(k.timeStr.c_str());
        k.blue    = kf["blue"] | 0.0f;
        k.white   = kf["white"] | 0.0f;
        k.uv      = kf["uv"] | 0.0f;
        outSchedule.keyframes.push_back(k);
    }

    // Ensure sorted by time
    std::sort(outSchedule.keyframes.begin(), outSchedule.keyframes.end(),
              [](const KeyframeData& a, const KeyframeData& b) {
                  return a.timeSec < b.timeSec;
              });

    return (outSchedule.keyframes.size() >= 2);
}

std::vector<String> StorageManager::listScheduleIds() {
    std::vector<String> ids;
    File dir = LittleFS.open(STORAGE_SCHEDULES_DIR);
    if (!dir || !dir.isDirectory()) return ids;

    File file = dir.openNextFile();
    while (file) {
        String fname = file.name();
        if (fname.endsWith(".json")) {
            int lastSlash = fname.lastIndexOf('/');
            String base = (lastSlash >= 0) ? fname.substring(lastSlash + 1) : fname;
            String id = base.substring(0, base.length() - 5);
            ids.push_back(id);
        }
        file = dir.openNextFile();
    }
    return ids;
}

String StorageManager::getScheduleJson(const String& id) {
    String path = String(STORAGE_SCHEDULES_DIR) + "/" + id + ".json";
    if (!LittleFS.exists(path.c_str())) return "{}";
    File f = LittleFS.open(path.c_str(), "r");
    if (!f) return "{}";
    String content = f.readString();
    f.close();
    return content;
}

bool StorageManager::saveWeeklyAssignment(const String& jsonStr) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, jsonStr);
    if (error) {
        Serial.printf("[STORAGE] Failed to parse weekly JSON: %s\n", error.c_str());
        return false;
    }

    File f = LittleFS.open(STORAGE_WEEKLY_PATH, "w");
    if (!f) return false;
    serializeJson(doc, f);
    f.close();
    Serial.println("[STORAGE] Weekly assignment saved successfully");
    return true;
}

bool StorageManager::loadWeeklyAssignment(WeeklyAssignmentData& outWeekly) {
    if (!LittleFS.exists(STORAGE_WEEKLY_PATH)) {
        seedDefaultData();
    }

    File f = LittleFS.open(STORAGE_WEEKLY_PATH, "r");
    if (!f) return false;

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, f);
    f.close();

    if (error) return false;

    outWeekly.mon = doc["mon"] | "reef_growth";
    outWeekly.tue = doc["tue"] | "reef_growth";
    outWeekly.wed = doc["wed"] | "reef_growth";
    outWeekly.thu = doc["thu"] | "reef_growth";
    outWeekly.fri = doc["fri"] | "reef_growth";
    outWeekly.sat = doc["sat"] | "reef_growth";
    outWeekly.sun = doc["sun"] | "reef_growth";
    return true;
}

String StorageManager::getWeeklyAssignmentJson() {
    if (!LittleFS.exists(STORAGE_WEEKLY_PATH)) return "{}";
    File f = LittleFS.open(STORAGE_WEEKLY_PATH, "r");
    if (!f) return "{}";
    String content = f.readString();
    f.close();
    return content;
}

bool StorageManager::saveAcclimation(const AcclimationData& acc) {
    prefs.putBool("acc_active", acc.active);
    prefs.putString("acc_sched", acc.scheduleId);
    prefs.putFloat("acc_start", acc.startPct);
    prefs.putInt("acc_days", acc.daysTotal);
    prefs.putString("acc_time", acc.startedAt);
    return true;
}

bool StorageManager::loadAcclimation(AcclimationData& outAcc) {
    outAcc.active = prefs.getBool("acc_active", false);
    outAcc.scheduleId = prefs.getString("acc_sched", "reef_growth");
    outAcc.startPct = prefs.getFloat("acc_start", 50.0f);
    outAcc.daysTotal = prefs.getInt("acc_days", 14);
    outAcc.startedAt = prefs.getString("acc_time", "");
    return true;
}

int StorageManager::getOverrideTimeout() {
    return prefs.getInt("ovr_timeout", DEFAULT_OVERRIDE_TIMEOUT_SEC);
}

void StorageManager::setOverrideTimeout(int seconds) {
    prefs.putInt("ovr_timeout", seconds);
}

long StorageManager::getTimezoneOffset() {
    return prefs.getLong("tz_offset", DEFAULT_TIMEZONE_OFFSET_SEC);
}

void StorageManager::setTimezoneOffset(long offsetSec) {
    prefs.putLong("tz_offset", offsetSec);
}

int StorageManager::getDisplayBrightness() {
    int b = prefs.getInt("disp_bright", 180);
    if (b < 50) b = 180; // Always boot visible after power loss
    return b;
}

void StorageManager::setDisplayBrightness(int brightness) {
    prefs.putInt("disp_bright", brightness);
}

bool StorageManager::getFanInverted() {
    return prefs.getBool("fan_inv", LEDC_FAN_INVERTED_DEFAULT);
}

void StorageManager::setFanInverted(bool inverted) {
    prefs.putBool("fan_inv", inverted);
}

bool StorageManager::getFanManualOverride() {
    return prefs.getBool("fan_man_ovr", false);
}

void StorageManager::setFanManualOverride(bool override) {
    prefs.putBool("fan_man_ovr", override);
}

void StorageManager::saveMode(const String& mode) {
    prefs.putString("saved_mode", mode);
}

String StorageManager::loadSavedMode() {
    // Aquarium life safety: following any power loss, controller must always resume auto schedule
    return "auto";
}

void StorageManager::saveLastKnownOutputs(float b, float w, float uv, float fan) {
    prefs.putFloat("last_b", b);
    prefs.putFloat("last_w", w);
    prefs.putFloat("last_uv", uv);
    prefs.putFloat("last_fan", fan);
}

void StorageManager::loadLastKnownOutputs(float& b, float& w, float& uv, float& fan) {
    b = prefs.getFloat("last_b", 0.0f);
    w = prefs.getFloat("last_w", 0.0f);
    uv = prefs.getFloat("last_uv", 0.0f);
    fan = prefs.getFloat("last_fan", 0.0f);
    // User constraint: if light is off, fan must stay off (0%). If on, fan must stay below 30%.
    if (b <= 0.5f && w <= 0.5f && uv <= 0.5f) {
        fan = 0.0f;
    } else {
        fan = constrain(fan, 0.0f, 28.0f);
    }
}

bool StorageManager::isBootConfirmed() {
    return prefs.getBool("boot_ok", true);
}

void StorageManager::markBootConfirmed() {
    prefs.putBool("boot_ok", true);
}

void StorageManager::markBootPending() {
    prefs.putBool("boot_ok", false);
}
