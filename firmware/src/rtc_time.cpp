#include "rtc_time.h"
#include <WiFi.h>
#include <sys/time.h>
#include "schedule_engine.h"

RtcTimeManager rtcManager;

static const char* ntpServer1 = "in.pool.ntp.org";
static const char* ntpServer2 = "pool.ntp.org";
static const char* ntpServer3 = "time.google.com";

RtcTimeManager::RtcTimeManager()
    : rtcPresent(false),
      timeConfirmed(false),
      timezoneOffsetSec(DEFAULT_TIMEZONE_OFFSET_SEC),
      lastNtpSyncMillis(0),
      lastNtpAttemptMillis(0) {}

void RtcTimeManager::begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    // Attempt to locate and initialize DS3231 RTC
    if (rtc.begin(&Wire)) {
        if (!rtc.lostPower()) {
            DateTime now = rtc.now();
            if (now.year() >= 2024 && now.year() <= 2099) {
                rtcPresent = true;
                timeConfirmed = true;
                updateSystemTimeFromRtc();
                Serial.printf("[RTC] DS3231 found and valid. Current time: %s\n", getNowISO().c_str());
            } else {
                Serial.println("[RTC] DS3231 year invalid (needs sync)");
            }
        } else {
            Serial.println("[RTC] DS3231 battery lost power, waiting for time sync");
        }
    } else {
        Serial.println("[RTC] DS3231 not detected on I2C bus. Running in fallback mode.");
    }
}

void RtcTimeManager::updateSystemTimeFromRtc() {
    DateTime now = rtc.now();
    struct timeval tv;
    tv.tv_sec = now.unixtime() - timezoneOffsetSec; // Store UTC internally
    tv.tv_usec = 0;
    settimeofday(&tv, NULL);
}

void RtcTimeManager::updateRtcFromSystemTime() {
    if (!rtcPresent) return;
    time_t raw = time(NULL);
    if (raw < 1704067200) return; // Prior to 2024-01-01
    // RTC stores local time
    DateTime dt(raw + timezoneOffsetSec);
    rtc.adjust(dt);
    Serial.printf("[RTC] Synced DS3231 hardware clock to: %04d-%02d-%02d %02d:%02d:%02d\n",
                  dt.year(), dt.month(), dt.day(), dt.hour(), dt.minute(), dt.second());
}

bool RtcTimeManager::syncNtp() {
    if (WiFi.status() != WL_CONNECTED) return false;

    Serial.printf("[NTP] Requesting sync from %s (%s, %s)...\n", ntpServer1, ntpServer2, ntpServer3);
    // Use 0, 0 so system clock stores true UTC
    configTime(0, 0, ntpServer1, ntpServer2, ntpServer3);
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 6000)) {
        timeConfirmed = true;
        lastNtpSyncMillis = millis();
        time_t localEpoch = time(NULL) + timezoneOffsetSec;
        struct tm* loc = gmtime(&localEpoch);
        Serial.printf("[NTP] Successful sync. Local time: %04d-%02d-%02d %02d:%02d:%02d\n",
                      loc->tm_year + 1900, loc->tm_mon + 1, loc->tm_mday,
                      loc->tm_hour, loc->tm_min, loc->tm_sec);
        if (rtcPresent) {
            updateRtcFromSystemTime();
        }
        scheduleEngine.notifyTimeConfirmed();
        return true;
    }
    Serial.println("[NTP] Sync timed out. Retrying in background...");
    return false;
}

void RtcTimeManager::loop() {
    // Re-sync NTP periodically if WiFi connected (every 6 hours, or every 15s until first sync)
    unsigned long now = millis();
    if (WiFi.status() == WL_CONNECTED) {
        unsigned long retryInterval = timeConfirmed ? 21600000UL : 15000UL;
        if (!timeConfirmed || (now - lastNtpSyncMillis > retryInterval)) {
            if (now - lastNtpAttemptMillis > retryInterval) {
                lastNtpAttemptMillis = now;
                syncNtp();
            }
        }
    }
}

void RtcTimeManager::setTimeFromEpoch(time_t epoch) {
    struct timeval tv;
    tv.tv_sec = epoch;
    tv.tv_usec = 0;
    settimeofday(&tv, NULL);
    timeConfirmed = true;
    if (rtcPresent) {
        updateRtcFromSystemTime();
    }
    Serial.printf("[RTC] Time updated from epoch. ISO: %s\n", getNowISO().c_str());
    scheduleEngine.notifyTimeConfirmed();
}

bool RtcTimeManager::setTimeFromISO(const String& isoStr) {
    // Expected format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM:SS.sssZ
    if (isoStr.length() < 19) return false;
    struct tm tmParsed;
    memset(&tmParsed, 0, sizeof(struct tm));
    int year, month, day, hour, min, sec;
    if (sscanf(isoStr.c_str(), "%d-%d-%dT%d:%d:%d", &year, &month, &day, &hour, &min, &sec) == 6) {
        tmParsed.tm_year = year - 1900;
        tmParsed.tm_mon = month - 1;
        tmParsed.tm_mday = day;
        tmParsed.tm_hour = hour;
        tmParsed.tm_min = min;
        tmParsed.tm_sec = sec;
        time_t parsedEpoch = mktime(&tmParsed);
        // If string ends with 'Z' (Zulu/UTC), the parsed numbers are UTC, do NOT subtract offset!
        // If it's local time without 'Z', convert local time to UTC by subtracting timezone offset
        time_t utcEpoch = (isoStr.indexOf('Z') >= 0) ? parsedEpoch : (parsedEpoch - timezoneOffsetSec);
        setTimeFromEpoch(utcEpoch);
        return true;
    }
    return false;
}

time_t RtcTimeManager::getEpoch() {
    return time(NULL);
}

String RtcTimeManager::getNowISO() {
    time_t raw = time(NULL) + timezoneOffsetSec;
    struct tm* ti = gmtime(&raw);
    char buf[30];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d+05:30",
             ti->tm_year + 1900, ti->tm_mon + 1, ti->tm_mday,
             ti->tm_hour, ti->tm_min, ti->tm_sec);
    return String(buf);
}

String RtcTimeManager::getFormattedTime() {
    time_t raw = time(NULL) + timezoneOffsetSec;
    struct tm* ti = gmtime(&raw);
    char buf[16];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", ti->tm_hour, ti->tm_min, ti->tm_sec);
    return String(buf);
}

int RtcTimeManager::getSecondsOfDay() {
    time_t raw = time(NULL) + timezoneOffsetSec;
    struct tm* ti = gmtime(&raw);
    return (ti->tm_hour * 3600) + (ti->tm_min * 60) + ti->tm_sec;
}

int RtcTimeManager::getDayOfWeek() {
    time_t raw = time(NULL) + timezoneOffsetSec;
    struct tm* ti = gmtime(&raw);
    return ti->tm_wday; // 0=Sun, 1=Mon, ..., 6=Sat
}

String RtcTimeManager::getDayOfWeekStr() {
    int dow = getDayOfWeek();
    switch (dow) {
        case 1: return "mon";
        case 2: return "tue";
        case 3: return "wed";
        case 4: return "thu";
        case 5: return "fri";
        case 6: return "sat";
        case 0:
        default: return "sun";
    }
}

void RtcTimeManager::setTimezoneOffset(long offsetSec) {
    timezoneOffsetSec = offsetSec;
}
