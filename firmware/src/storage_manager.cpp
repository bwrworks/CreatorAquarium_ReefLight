#include "storage_manager.h"

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

    if (!LittleFS.exists(STORAGE_WEEKLY_PATH)) {
        seedDefaultData();
    }

    return true;
}

void StorageManager::seedDefaultData() {
    Serial.println("[STORAGE] Seeding default reef schedules and weekly assignment...");

    // Default schedule: Natural Reef Daylight (Sunrise, Peak Daylight, Sunset, Deep Royal Blue Pop)
    const char* defaultScheduleJson = R"json({
  "id": "natural_reef",
  "name": "Natural Reef Daylight",
  "keyframes": [
    { "time": "00:00", "blue": 0, "white": 0, "red": 0, "uv": 0 },
    { "time": "07:30", "blue": 0, "white": 0, "red": 0, "uv": 0 },
    { "time": "09:00", "blue": 35, "white": 10, "red": 5, "uv": 15 },
    { "time": "12:00", "blue": 80, "white": 50, "red": 20, "uv": 65 },
    { "time": "15:00", "blue": 85, "white": 55, "red": 20, "uv": 70 },
    { "time": "18:00", "blue": 70, "white": 25, "red": 10, "uv": 50 },
    { "time": "20:30", "blue": 40, "white": 0, "red": 0, "uv": 30 },
    { "time": "22:00", "blue": 5, "white": 0, "red": 0, "uv": 0 },
    { "time": "23:00", "blue": 0, "white": 0, "red": 0, "uv": 0 }
  ]
})json";

    saveSchedule(String(defaultScheduleJson));

    // Default weekly assignment: all 7 days set to "natural_reef"
    const char* defaultWeeklyJson = R"json({
  "mon": "natural_reef",
  "tue": "natural_reef",
  "wed": "natural_reef",
  "thu": "natural_reef",
  "fri": "natural_reef",
  "sat": "natural_reef",
  "sun": "natural_reef"
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
        k.red     = kf["red"] | 0.0f;
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

    outWeekly.mon = doc["mon"] | "natural_reef";
    outWeekly.tue = doc["tue"] | "natural_reef";
    outWeekly.wed = doc["wed"] | "natural_reef";
    outWeekly.thu = doc["thu"] | "natural_reef";
    outWeekly.fri = doc["fri"] | "natural_reef";
    outWeekly.sat = doc["sat"] | "natural_reef";
    outWeekly.sun = doc["sun"] | "natural_reef";
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
    outAcc.scheduleId = prefs.getString("acc_sched", "natural_reef");
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
    return prefs.getInt("disp_bright", 255);
}

void StorageManager::setDisplayBrightness(int brightness) {
    prefs.putInt("disp_bright", brightness);
}

void StorageManager::saveLastKnownOutputs(float b, float w, float r, float uv, float fan) {
    prefs.putFloat("last_b", b);
    prefs.putFloat("last_w", w);
    prefs.putFloat("last_r", r);
    prefs.putFloat("last_uv", uv);
    prefs.putFloat("last_fan", fan);
}

void StorageManager::loadLastKnownOutputs(float& b, float& w, float& r, float& uv, float& fan) {
    b = prefs.getFloat("last_b", 0.0f);
    w = prefs.getFloat("last_w", 0.0f);
    r = prefs.getFloat("last_r", 0.0f);
    uv = prefs.getFloat("last_uv", 0.0f);
    fan = prefs.getFloat("last_fan", 0.0f);
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
