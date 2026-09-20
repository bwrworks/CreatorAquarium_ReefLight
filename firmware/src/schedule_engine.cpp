#include "schedule_engine.h"
#include "oled_display.h"

ScheduleEngine scheduleEngine;

ScheduleEngine::ScheduleEngine()
    : mutex(nullptr),
      currentMode("auto"),
      manualOverrideUntilEpoch(0),
      lastManualTouchMillis(0),
      currentFan(0.0f),
      fanManualOverride(false),
      bootHoldActive(true),
      bootStartMillis(0),
      currentActiveScheduleId("reef_growth"),
      lastNvsSaveMillis(0),
      pendingNvsSave(false),
      currentDisplayBrightness(255),
      pendingDisplayNvsSave(false),
      lastDisplayTouchMillis(0),
      tickCount(0) {
    manualValues = {0.0f, 0.0f, 0.0f, 0.0f};
}

void ScheduleEngine::begin() {
    mutex = xSemaphoreCreateMutex();
    bootStartMillis = millis();
    bootHoldActive = true;

    // Load initial weekly assignment, acclimation status, and fan polarity
    storageManager.loadWeeklyAssignment(weekly);
    storageManager.loadAcclimation(acclimation);
    ledcDriver.setFanInverted(storageManager.getFanInverted());

    // Restore last known outputs, mode, fan manual override, and display brightness from NVS
    float b, w, uv, fan;
    storageManager.loadLastKnownOutputs(b, w, uv, fan);
    manualValues = {b, w, uv, fan};
    currentMode = storageManager.loadSavedMode();
    currentFan = fan;
    fanManualOverride = storageManager.getFanManualOverride();
    currentDisplayBrightness = storageManager.getDisplayBrightness();

    Serial.printf("[ENGINE] Restored NVS state: Mode=%s, Outputs=(B:%.1f, W:%.1f, UV:%.1f, Fan:%.1f), FanOverride=%s, DispBright=%d\n",
                  currentMode.c_str(), b, w, uv, fan, fanManualOverride ? "YES" : "NO", currentDisplayBrightness);

    // Start safe at 0% output on power-on to completely prevent initial bright flashes.
    // Holds 0% during 15s boot period while WiFi/MQTT connect or until user active command.
    ledcDriver.setChannels(0.0f, 0.0f, 0.0f);
    ledcDriver.setFan(0.0f);

    resolveTodaySchedule();

    // Launch dedicated FreeRTOS task on Core 1 (1Hz tick rate)
    xTaskCreatePinnedToCore(
        ScheduleEngine::taskFunction,
        "ScheduleEngineTask",
        4096,
        this,
        2, // Priority 2
        NULL,
        1  // Core 1
    );
}

void ScheduleEngine::taskFunction(void* param) {
    ScheduleEngine* engine = (ScheduleEngine*)param;
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = pdMS_TO_TICKS(100); // 100ms = 10Hz smooth slew
    uint8_t subTick = 0;

    for (;;) {
        vTaskDelayUntil(&xLastWakeTime, xFrequency);

        // Hardware slew ramping: 2.0%/100ms in auto (gentle for livestock), 25.0%/100ms in manual (snappy real-time slider tracking)
        // Note: during initial 60s boot soft-start, LedcDriver automatically caps slew at 0.15%/100ms (~50-60s ramp) unless manually touched
        if (xSemaphoreTake(engine->mutex, pdMS_TO_TICKS(20)) == pdTRUE) {
            float maxDelta = (engine->currentMode == "manual") ? 25.0f : 2.0f;
            ledcDriver.updateSlew(maxDelta);
            xSemaphoreGive(engine->mutex);
        }

        subTick++;
        if (subTick >= 10) {
            subTick = 0;
            engine->tick();
        }
    }
}

void ScheduleEngine::tick() {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return;
    }

    tickCount++;

    time_t nowEpoch = rtcManager.getEpoch();
    int secOfDay = rtcManager.getSecondsOfDay();

    // Manual mode is permanent until user clicks Resume Auto or starts Acclimation
    // (15-minute auto-timeout intentionally removed per user design preference)

    // Always keep today's schedule resolved
    resolveTodaySchedule();

    // 0% Boot Quiet Hold: For first 15 seconds after power-on, hold outputs strictly at 0.0%
    // so fixture is completely pitch black while WiFi connects and app transmits desired state.
    if (bootHoldActive) {
        if (millis() - bootStartMillis < 15000UL) {
            ledcDriver.setChannels(0.0f, 0.0f, 0.0f);
            ledcDriver.setFan(0.0f);
            xSemaphoreGive(mutex);
            return;
        } else {
            bootHoldActive = false;
            Serial.println("[ENGINE] Boot quiet hold completed. Soft-starting outputs.");
            if (currentMode == "manual") {
                ledcDriver.setChannels(manualValues.blue, manualValues.white, manualValues.uv);
                ledcDriver.setFan(manualValues.fan);
            } else if (fanManualOverride) {
                ledcDriver.setFan(currentFan);
            }
        }
    }

    if (currentMode == "manual") {
        // In manual mode, targets are already set. Slew handled by LedcDriver taskFunction.
        ledcDriver.setChannels(manualValues.blue, manualValues.white, manualValues.uv);
        ledcDriver.setFan(manualValues.fan);
    } else {
        // Only run schedule engine if time is confirmed
        if (rtcManager.isTimeConfirmed()) {
            evaluateSchedule(secOfDay);
        }
    }

    // Defer NVS save until 3 seconds after user finishes adjusting sliders
    unsigned long nowMillis2 = millis();
    if (pendingNvsSave && (nowMillis2 - lastManualTouchMillis >= 3000UL)) {
        pendingNvsSave = false;
        storageManager.saveLastKnownOutputs(manualValues.blue, manualValues.white, manualValues.uv, manualValues.fan);
    }

    // Defer display brightness NVS write until 3 seconds after adjustment stops
    if (pendingDisplayNvsSave && (nowMillis2 - lastDisplayTouchMillis >= 3000UL)) {
        pendingDisplayNvsSave = false;
        storageManager.setDisplayBrightness(currentDisplayBrightness);
        Serial.printf("[ENGINE] Persisted display brightness %d to NVS\n", currentDisplayBrightness);
    }

    // Periodically save current applied outputs to NVS (every 5 minutes) for power outage recovery
    if (nowMillis2 - lastNvsSaveMillis >= 300000UL) {
        lastNvsSaveMillis = nowMillis2;
        ChannelValues applied = ledcDriver.getAppliedValues();
        storageManager.saveLastKnownOutputs(applied.blue, applied.white, applied.uv, applied.fan);
    }

    xSemaphoreGive(mutex);
}

void ScheduleEngine::resolveTodaySchedule() {
    // If an acclimation program is active, force the targeted schedule
    if (acclimation.active && acclimation.scheduleId.length() > 0) {
        if (currentActiveScheduleId != acclimation.scheduleId || activeSchedule.keyframes.empty()) {
            currentActiveScheduleId = acclimation.scheduleId;
            if (!storageManager.loadSchedule(currentActiveScheduleId, activeSchedule)) {
                storageManager.loadSchedule("reef_growth", activeSchedule);
            }
            Serial.printf("[ENGINE] Acclimation schedule active: %s (%d keyframes)\n",
                          activeSchedule.name.c_str(), (int)activeSchedule.keyframes.size());
        }
        return;
    }

    String todayDow = rtcManager.getDayOfWeekStr();
    String targetSchedId = weekly.mon;

    if (todayDow == "mon") targetSchedId = weekly.mon;
    else if (todayDow == "tue") targetSchedId = weekly.tue;
    else if (todayDow == "wed") targetSchedId = weekly.wed;
    else if (todayDow == "thu") targetSchedId = weekly.thu;
    else if (todayDow == "fri") targetSchedId = weekly.fri;
    else if (todayDow == "sat") targetSchedId = weekly.sat;
    else if (todayDow == "sun") targetSchedId = weekly.sun;

    static String lastResolvedDow = "";
    static int lastResolvedWeek = -1;
    time_t nowSec = rtcManager.getEpoch();
    int currentWeekNum = (nowSec >= 1791072000ULL) ? 3 : ((nowSec >= 1790467200ULL) ? 2 : 1);
    bool forceRefresh = (todayDow != lastResolvedDow) || (currentWeekNum != lastResolvedWeek);

    if (forceRefresh || targetSchedId != currentActiveScheduleId || activeSchedule.keyframes.empty()) {
        lastResolvedDow = todayDow;
        lastResolvedWeek = currentWeekNum;
        currentActiveScheduleId = targetSchedId;
        if (!storageManager.loadSchedule(currentActiveScheduleId, activeSchedule)) {
            Serial.printf("[ENGINE] Failed to load schedule '%s', falling back to 'reef_growth'\n", currentActiveScheduleId.c_str());
            storageManager.loadSchedule("reef_growth", activeSchedule);
        }
        Serial.printf("[ENGINE] Active schedule for %s set to: %s (%d keyframes)\n",
                      todayDow.c_str(), activeSchedule.name.c_str(), (int)activeSchedule.keyframes.size());
    }
}

ChannelValues ScheduleEngine::interpolate(const std::vector<KeyframeData>& keyframes, int currentSecOfDay) {
    ChannelValues result = {0.0f, 0.0f, 0.0f, 0.0f};
    size_t count = keyframes.size();
    if (count == 0) return result;
    if (count == 1) {
        result.blue  = keyframes[0].blue;
        result.white = keyframes[0].white;
        result.uv    = keyframes[0].uv;
        return result;
    }

    // Find the bounding keyframes
    int idx1 = -1;
    int idx2 = -1;

    for (size_t i = 0; i < count; i++) {
        if (keyframes[i].timeSec <= currentSecOfDay) {
            idx1 = i;
        }
        if (keyframes[i].timeSec >= currentSecOfDay && idx2 == -1) {
            idx2 = i;
        }
    }

    // Handle wrap-around at day boundaries (before first keyframe or after last keyframe)
    if (idx1 == -1) {
        // Time is before keyframes[0]. Interpolate from keyframes[count - 1] to keyframes[0] across midnight
        const KeyframeData& k1 = keyframes[count - 1];
        const KeyframeData& k2 = keyframes[0];
        int dt = (86400 - k1.timeSec) + k2.timeSec;
        int elapsed = (86400 - k1.timeSec) + currentSecOfDay;
        float factor = (dt > 0) ? ((float)elapsed / (float)dt) : 0.0f;
        factor = constrain(factor, 0.0f, 1.0f);

        result.blue  = k1.blue  + (k2.blue  - k1.blue)  * factor;
        result.white = k1.white + (k2.white - k1.white) * factor;
        result.uv    = k1.uv    + (k2.uv    - k1.uv)    * factor;
        return result;
    }

    if (idx2 == -1 || idx1 == (int)(count - 1)) {
        // Time is after keyframes[count - 1]. Interpolate from keyframes[count - 1] to keyframes[0] across midnight
        const KeyframeData& k1 = keyframes[count - 1];
        const KeyframeData& k2 = keyframes[0];
        int dt = (86400 - k1.timeSec) + k2.timeSec;
        int elapsed = currentSecOfDay - k1.timeSec;
        float factor = (dt > 0) ? ((float)elapsed / (float)dt) : 0.0f;
        factor = constrain(factor, 0.0f, 1.0f);

        result.blue  = k1.blue  + (k2.blue  - k1.blue)  * factor;
        result.white = k1.white + (k2.white - k1.white) * factor;
        result.uv    = k1.uv    + (k2.uv    - k1.uv)    * factor;
        return result;
    }

    if (idx1 == idx2) {
        result.blue  = keyframes[idx1].blue;
        result.white = keyframes[idx1].white;
        result.uv    = keyframes[idx1].uv;
        return result;
    }

    // Normal case between two keyframes on the same day
    const KeyframeData& k1 = keyframes[idx1];
    const KeyframeData& k2 = keyframes[idx2];
    int dt = k2.timeSec - k1.timeSec;
    int elapsed = currentSecOfDay - k1.timeSec;
    float factor = (dt > 0) ? ((float)elapsed / (float)dt) : 0.0f;
    factor = constrain(factor, 0.0f, 1.0f);

    result.blue  = k1.blue  + (k2.blue  - k1.blue)  * factor;
    result.white = k1.white + (k2.white - k1.white) * factor;
    result.uv    = k1.uv    + (k2.uv    - k1.uv)    * factor;
    return result;
}

float ScheduleEngine::computeAcclimationScale() {
    if (!acclimation.active) return 1.0f;

    // Parse startedAt ISO to epoch
    time_t startedEpoch = 0;
    int y, m, d, hh, mm, ss;
    if (sscanf(acclimation.startedAt.c_str(), "%d-%d-%dT%d:%d:%d", &y, &m, &d, &hh, &mm, &ss) == 6) {
        struct tm tmStart;
        memset(&tmStart, 0, sizeof(struct tm));
        tmStart.tm_year = y - 1900;
        tmStart.tm_mon = m - 1;
        tmStart.tm_mday = d;
        tmStart.tm_hour = hh;
        tmStart.tm_min = mm;
        tmStart.tm_sec = ss;
        startedEpoch = mktime(&tmStart) - rtcManager.getTimezoneOffset();
    }

    time_t nowEpoch = rtcManager.getEpoch();
    if (startedEpoch <= 0 || nowEpoch < startedEpoch) return acclimation.startPct / 100.0f;

    double elapsedSeconds = difftime(nowEpoch, startedEpoch);
    double elapsedDays = elapsedSeconds / 86400.0;

    if (elapsedDays >= (double)acclimation.daysTotal) {
        // Completed! Auto-disable acclimation
        Serial.println("[ENGINE] Acclimation period completed. Scaling now 100%.");
        acclimation.active = false;
        storageManager.saveAcclimation(acclimation);
        return 1.0f;
    }

    double progress = elapsedDays / (double)acclimation.daysTotal;
    float currentPct = acclimation.startPct + (100.0f - acclimation.startPct) * (float)progress;
    return constrain(currentPct / 100.0f, 0.0f, 1.0f);
}

void ScheduleEngine::evaluateSchedule(int secOfDay) {
    ChannelValues target = interpolate(activeSchedule.keyframes, secOfDay);

    // Apply acclimation scaling if active
    float scale = computeAcclimationScale();
    target.blue  *= scale;
    target.white *= scale;
    target.uv    *= scale;

    // Mandatory Coral Safety Rule: Automatic schedules NEVER exceed 60.0% capacity
    const float AUTO_MAX_CAP = 60.0f;
    target.blue  = min(target.blue,  AUTO_MAX_CAP);
    target.white = min(target.white, AUTO_MAX_CAP);
    target.uv    = min(target.uv,    AUTO_MAX_CAP);

    ledcDriver.setChannels(target.blue, target.white, target.uv);

    // Only apply automatic dynamic cooling fan curve if user has NOT manually adjusted the fan
    if (!fanManualOverride) {
        // 3-channel fan curve: Blue + White + UV
        float totalIntensity = (target.blue + target.white + target.uv) / 3.0f;
        float dynamicFan = (totalIntensity > 5.0f) ? constrain(40.0f + totalIntensity * 0.6f, 40.0f, 100.0f) : 40.0f;
        currentFan = dynamicFan;
        ledcDriver.setFan(dynamicFan);
    }
}

void ScheduleEngine::releaseBootHold() {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        if (bootHoldActive) {
            bootHoldActive = false;
            Serial.println("[ENGINE] Active user/cloud command received; released boot quiet hold.");
        }
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::setMode(const String& mode) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        bootHoldActive = false;
        String targetMode = (mode == "manual") ? "manual" : "auto";
        if (currentMode != targetMode) {
            currentMode = targetMode;
            storageManager.saveMode(currentMode);
        }
        if (currentMode == "auto") {
            manualOverrideUntilEpoch = 0;
            if (fanManualOverride) {
                fanManualOverride = false;
                storageManager.setFanManualOverride(false);
            }
            // Instantly evaluate current schedule output without waiting for next tick
            if (rtcManager.isTimeConfirmed()) {
                evaluateSchedule(rtcManager.getSecondsOfDay());
            }
        } else {
            int timeoutSec = storageManager.getOverrideTimeout();
            manualOverrideUntilEpoch = rtcManager.getEpoch() + timeoutSec;
            ChannelValues applied = ledcDriver.getAppliedValues();
            manualValues = applied;
        }
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::setManualChannels(float b, float w, float uv) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        bootHoldActive = false;
        // Guarded mode transition: only write to NVS when mode actually flips (auto -> manual)
        // Never call storageManager.saveMode on high-frequency slider drag ticks
        if (currentMode != "manual") {
            currentMode = "manual";
            storageManager.saveMode("manual");
        }
        // Reset the 15-minute inactivity timer every time user touches a slider
        lastManualTouchMillis = millis();
        manualOverrideUntilEpoch = 0; // Not epoch-based; uses millis inactivity instead
        manualValues.blue  = b;
        manualValues.white = w;
        manualValues.uv    = uv;
        ledcDriver.disableSoftStart(); // Immediately bypass boot soft-start when user takes manual control
        ledcDriver.setChannels(b, w, uv);
        pendingNvsSave = true; // Defer NVS write so flash is not blocked on every slider step
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::setFan(float fanPct) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        bootHoldActive = false;
        currentFan = constrain(fanPct, 0.0f, 100.0f);
        // Guarded fan manual override: only write to NVS when flag actually flips
        if (!fanManualOverride) {
            fanManualOverride = true;
            storageManager.setFanManualOverride(true);
        }
        manualValues.fan = currentFan;
        ledcDriver.disableSoftStart();
        ledcDriver.setFan(currentFan);
        lastManualTouchMillis = millis();
        pendingNvsSave = true;
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::setDisplayBrightness(int brightness) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        currentDisplayBrightness = constrain(brightness, 0, 255);
        // Hardware LEDC PWM updates immediately for 0-latency live slider response
        oledDisplay.setBrightness((uint8_t)currentDisplayBrightness);
        // Defer NVS write so flash is not written during slider dragging
        pendingDisplayNvsSave = true;
        lastDisplayTouchMillis = millis();
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::setMasterOn(bool on) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        bootHoldActive = false;
        ledcDriver.setMasterOn(on);
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::reloadConfig() {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        storageManager.loadWeeklyAssignment(weekly);
        storageManager.loadAcclimation(acclimation);
        currentActiveScheduleId = ""; // force reload
        resolveTodaySchedule();
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::startAcclimation(const String& scheduleId, float startPct, int days) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        if (currentMode != "auto") {
            currentMode = "auto";
            storageManager.saveMode("auto");
        }
        lastManualTouchMillis = 0;
        manualOverrideUntilEpoch = 0;
        acclimation.active = true;
        acclimation.scheduleId = scheduleId;
        acclimation.startPct = constrain(startPct, 10.0f, 95.0f);
        acclimation.daysTotal = max(days, 1);
        acclimation.startedAt = rtcManager.getNowISO();
        storageManager.saveAcclimation(acclimation);

        if (scheduleId.length() > 0) {
            currentActiveScheduleId = scheduleId;
            storageManager.loadSchedule(currentActiveScheduleId, activeSchedule);
        }

        evaluateSchedule(rtcManager.getSecondsOfDay());

        xSemaphoreGive(mutex);
        Serial.printf("[ENGINE] Acclimation started for %d days at %.1f%% on schedule '%s'\n",
                      days, startPct, scheduleId.c_str());
    }
}

void ScheduleEngine::cancelAcclimation() {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        acclimation.active = false;
        storageManager.saveAcclimation(acclimation);
        currentActiveScheduleId = "";
        resolveTodaySchedule();
        evaluateSchedule(rtcManager.getSecondsOfDay());
        xSemaphoreGive(mutex);
        Serial.println("[ENGINE] Acclimation cancelled");
    }
}

DeviceStateSnapshot ScheduleEngine::getStateSnapshot(bool wifiConn, bool cloudConn) {
    DeviceStateSnapshot snap;
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        snap.mode = currentMode;
        snap.live = ledcDriver.getAppliedValues();
        snap.live.fan = currentFan;
        snap.activeScheduleId = currentActiveScheduleId;
        snap.acclimation = acclimation;
        snap.time = rtcManager.getNowISO();
        snap.wifiConnected = wifiConn;
        snap.cloudConnected = cloudConn;
        snap.firmwareVersion = FIRMWARE_VERSION;
        snap.masterOn = ledcDriver.isMasterOn();
        snap.fanInverted = ledcDriver.isFanInverted();
        snap.fanManualOverride = fanManualOverride;
        snap.displayBrightness = currentDisplayBrightness;

        if (currentMode == "manual") {
            long rem = 0;
            if (lastManualTouchMillis > 0) {
                unsigned long elapsed = millis() - lastManualTouchMillis;
                rem = (elapsed < 900000UL) ? (long)((900000UL - elapsed) / 1000UL) : 0;
            } else if (manualOverrideUntilEpoch > 0) {
                time_t nowEpoch = rtcManager.getEpoch();
                long diff = (long)difftime(manualOverrideUntilEpoch, nowEpoch);
                rem = (diff > 0) ? diff : 0;
            }
            snap.manualOverrideRemainingSec = rem;

            if (rem > 0 && rtcManager.isTimeConfirmed()) {
                time_t expiryEpoch = rtcManager.getEpoch() + rem;
                time_t raw = expiryEpoch + rtcManager.getTimezoneOffset();
                struct tm* ti = gmtime(&raw);
                char buf[35];
                snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d+05:30",
                         ti->tm_year + 1900, ti->tm_mon + 1, ti->tm_mday,
                         ti->tm_hour, ti->tm_min, ti->tm_sec);
                snap.manualOverrideExpiresAt = String(buf);
            } else {
                snap.manualOverrideExpiresAt = "";
            }
        } else {
            snap.manualOverrideRemainingSec = 0;
            snap.manualOverrideExpiresAt = "";
        }

        if (acclimation.active) {
            time_t startedEpoch = 0;
            int y, m, d, hh, mm, ss;
            if (sscanf(acclimation.startedAt.c_str(), "%d-%d-%dT%d:%d:%d", &y, &m, &d, &hh, &mm, &ss) == 6) {
                struct tm tmStart;
                memset(&tmStart, 0, sizeof(struct tm));
                tmStart.tm_year = y - 1900;
                tmStart.tm_mon = m - 1;
                tmStart.tm_mday = d;
                tmStart.tm_hour = hh;
                tmStart.tm_min = mm;
                tmStart.tm_sec = ss;
                startedEpoch = mktime(&tmStart) - rtcManager.getTimezoneOffset();
            }
            time_t nowEpoch = rtcManager.getEpoch();
            if (startedEpoch > 0 && nowEpoch >= startedEpoch) {
                double elapsedSeconds = difftime(nowEpoch, startedEpoch);
                int days = (int)(elapsedSeconds / 86400.0);
                snap.acclimationDaysElapsed = min(days, acclimation.daysTotal);
                double progress = (double)days / (double)acclimation.daysTotal;
                float currentPct = acclimation.startPct + (100.0f - acclimation.startPct) * (float)progress;
                snap.acclimationCurrentScale = constrain(currentPct, acclimation.startPct, 100.0f);
            } else {
                snap.acclimationDaysElapsed = 0;
                snap.acclimationCurrentScale = acclimation.startPct;
            }
        } else {
            snap.acclimationDaysElapsed = 0;
            snap.acclimationCurrentScale = 100.0f;
        }

        xSemaphoreGive(mutex);
    }
    return snap;
}
