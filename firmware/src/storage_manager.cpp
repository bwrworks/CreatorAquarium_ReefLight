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

    if (!LittleFS.exists(STORAGE_WEEKLY_PATH) || 
        !LittleFS.exists(String(STORAGE_SCHEDULES_DIR) + "/reef_growth.json") ||
        LittleFS.exists(String(STORAGE_SCHEDULES_DIR) + "/reef_growth_w1.json")) {
        seedDefaultData();
    }

    return true;
}

void StorageManager::seedDefaultData() {
    Serial.println("[STORAGE] Seeding Reef Growth 9h Photoperiod (12:00-21:00, 50% Blue, 25% White, 40% UV)...");

    // Remove legacy schedule files
    deleteSchedule("natural_reef");
    deleteSchedule("deep_coral_pop");
    deleteSchedule("reef_growth_w1");
    deleteSchedule("reef_growth_w2");
    deleteSchedule("reef_growth_w3");

    // Clean 9h Photoperiod: 12:00 to 21:00
    // Ramp up: 12:00 to 13:00 (1h)
    // Daylight Peak: 13:00 to 20:00 (7h peak at Blue 50%, White 25%, UV 40%)
    // Ramp down: 20:00 to 21:00 (1h)
    const char* reefGrowthJson = R"json({
  "id": "reef_growth",
  "name": "Reef Growth (9h Daily)",
  "keyframes": [
    { "time": "00:00", "blue": 0, "white": 0, "uv": 0 },
    { "time": "12:00", "blue": 0, "white": 0, "uv": 0 },
    { "time": "13:00", "blue": 50, "white": 25, "uv": 40 },
    { "time": "20:00", "blue": 50, "white": 25, "uv": 40 },
    { "time": "21:00", "blue": 0, "white": 0, "uv": 0 },
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
    if (id == "natural_reef" || id == "reef_growth_w1" || id == "reef_growth_w2" || id == "reef_growth_w3") {
        return loadSchedule("reef_growth", outSchedule);
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
    int b = prefs.getInt("disp_bright", 200);
    if (b < 50) b = 200; // Always boot visible after power loss
    return b;
}

void StorageManager::setDisplayBrightness(int brightness) {
    if (brightness > 0 && brightness < 50) brightness = 50;
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
