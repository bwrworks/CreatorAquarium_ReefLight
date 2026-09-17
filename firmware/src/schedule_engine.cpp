#include "schedule_engine.h"

ScheduleEngine scheduleEngine;

ScheduleEngine::ScheduleEngine()
    : mutex(nullptr),
      currentMode("auto"),
      manualOverrideUntilEpoch(0),
      lastManualTouchMillis(0),
      currentFan(80.0f),
      fanManualOverride(false),
      currentActiveScheduleId("natural_reef"),
      lastNvsSaveMillis(0),
      pendingNvsSave(false),
      tickCount(0) {
    manualValues = {0.0f, 0.0f, 0.0f, 80.0f};
}

void ScheduleEngine::begin() {
    mutex = xSemaphoreCreateMutex();

    // Load initial weekly assignment & acclimation status
    storageManager.loadWeeklyAssignment(weekly);
    storageManager.loadAcclimation(acclimation);

    // If time is not confirmed at boot, load last known outputs and hold for safety (NFR-4)
    if (!rtcManager.isTimeConfirmed()) {
        float b, w, uv, fn;
        storageManager.loadLastKnownOutputs(b, w, uv, fn);
        if (fn < 30.0f) fn = 80.0f;
        Serial.printf("[ENGINE] Time unconfirmed on boot. Holding last known outputs (Fan: %.1f%%).\n", fn);
        // Set as target values — actual ramp from 10% happens via soft-start slew in LedcDriver
        ledcDriver.setChannels(b, w, uv);
        ledcDriver.setFan(fn);
    } else {
        ledcDriver.setFan(currentFan);
    }

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

    // Check if manual override expired by 15-minute inactivity (millis-based, works without confirmed RTC)
    if (currentMode == "manual" && lastManualTouchMillis > 0) {
        unsigned long nowMillis = millis();
        // 15 minutes = 900,000 ms
        if (nowMillis - lastManualTouchMillis >= 900000UL) {
            Serial.println("[ENGINE] 15-min manual inactivity timeout. Returning to Auto schedule.");
            currentMode = "auto";
            lastManualTouchMillis = 0;
            manualOverrideUntilEpoch = 0;
        }
    }

    // Always keep today's schedule resolved
    resolveTodaySchedule();

    if (currentMode == "manual") {
        // In manual mode, targets are already set. Slew handled by LedcDriver taskFunction.
        ledcDriver.setChannels(manualValues.blue, manualValues.white, manualValues.uv);
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

    // Periodically save current applied outputs to NVS (every 5 minutes) for power outage recovery
    if (nowMillis2 - lastNvsSaveMillis >= 300000UL) {
        lastNvsSaveMillis = nowMillis2;
        ChannelValues applied = ledcDriver.getAppliedValues();
        storageManager.saveLastKnownOutputs(applied.blue, applied.white, applied.uv, applied.fan);
    }

    xSemaphoreGive(mutex);
}

void ScheduleEngine::resolveTodaySchedule() {
    String todayDow = rtcManager.getDayOfWeekStr();
    String targetSchedId = weekly.mon;

    if (todayDow == "mon") targetSchedId = weekly.mon;
    else if (todayDow == "tue") targetSchedId = weekly.tue;
    else if (todayDow == "wed") targetSchedId = weekly.wed;
    else if (todayDow == "thu") targetSchedId = weekly.thu;
    else if (todayDow == "fri") targetSchedId = weekly.fri;
    else if (todayDow == "sat") targetSchedId = weekly.sat;
    else if (todayDow == "sun") targetSchedId = weekly.sun;

    if (targetSchedId != currentActiveScheduleId || activeSchedule.keyframes.empty()) {
        currentActiveScheduleId = targetSchedId;
        if (!storageManager.loadSchedule(currentActiveScheduleId, activeSchedule)) {
            Serial.printf("[ENGINE] Failed to load schedule '%s', falling back to 'natural_reef'\n", currentActiveScheduleId.c_str());
            storageManager.loadSchedule("natural_reef", activeSchedule);
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

void ScheduleEngine::setMode(const String& mode) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        currentMode = (mode == "manual") ? "manual" : "auto";
        if (currentMode == "auto") {
            manualOverrideUntilEpoch = 0;
            fanManualOverride = false; // Reset manual override when user resumes auto
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
        currentMode = "manual";
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
        currentFan = constrain(fanPct, 0.0f, 100.0f);
        fanManualOverride = true; // User manually locked/adjusted fan speed
        manualValues.fan = currentFan;
        ledcDriver.disableSoftStart();
        ledcDriver.setFan(currentFan);
        lastManualTouchMillis = millis();
        pendingNvsSave = true;
        xSemaphoreGive(mutex);
    }
}

void ScheduleEngine::setMasterOn(bool on) {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
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
        acclimation.active = true;
        acclimation.scheduleId = scheduleId;
        acclimation.startPct = constrain(startPct, 10.0f, 95.0f);
        acclimation.daysTotal = max(days, 1);
        acclimation.startedAt = rtcManager.getNowISO();
        storageManager.saveAcclimation(acclimation);
        xSemaphoreGive(mutex);
        Serial.printf("[ENGINE] Acclimation started for %d days at %.1f%%\n", days, startPct);
    }
}

void ScheduleEngine::cancelAcclimation() {
    if (xSemaphoreTake(mutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        acclimation.active = false;
        storageManager.saveAcclimation(acclimation);
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
