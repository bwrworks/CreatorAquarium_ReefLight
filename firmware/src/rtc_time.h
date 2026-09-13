#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <RTClib.h>
#include <time.h>
#include "../include/config.h"

class RtcTimeManager {
public:
    RtcTimeManager();
    void begin();
    
    // Updates internal state and checks NTP sync if online
    void loop();

    // Time confirmation status (true if confirmed by RTC hardware, NTP, or cmd/time)
    bool isTimeConfirmed() const { return timeConfirmed; }
    bool hasRtcHardware() const { return rtcPresent; }

    // Synchronize time from explicit ISO string (e.g. from cmd/time)
    bool setTimeFromISO(const String& isoStr);
    void setTimeFromEpoch(time_t epoch);

    // Sync from NTP (called when WiFi is active)
    bool syncNtp();

    // Time query helpers
    time_t getEpoch();
    String getNowISO();
    String getFormattedTime(); // "HH:MM:SS"
    int getSecondsOfDay();      // 0 - 86399
    // Returns 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    int getDayOfWeek();
    String getDayOfWeekStr();   // "mon", "tue", etc.

    void setTimezoneOffset(long offsetSec);
    long getTimezoneOffset() const { return timezoneOffsetSec; }

private:
    RTC_DS3231 rtc;
    bool rtcPresent;
    bool timeConfirmed;
    long timezoneOffsetSec;
    unsigned long lastNtpSyncMillis;
    unsigned long lastNtpAttemptMillis;

    void updateSystemTimeFromRtc();
    void updateRtcFromSystemTime();
};

extern RtcTimeManager rtcManager;
