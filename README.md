# CreatorAquarium ReefLight — Cloud-Connected LED Controller

High-precision, autonomous 4-channel LED and fan automation system for DIY reef aquarium fixtures powered by an ESP32 and a mobile-first Next.js PWA via HiveMQ Cloud MQTT.

---

## Features

- **Autonomous FreeRTOS Schedule Engine**: Runs locally on ESP32 Core 1 ticking at 1Hz with zero dependency on cloud or internet connectivity.
- **Hardware Drivers**:
  - **Royal Blue**: GPIO32 (5kHz frequency, 13-bit PWM resolution, 0–8191)
  - **Day White**: GPIO18 (5kHz frequency, 13-bit PWM resolution)
  - **Deep Red**: GPIO33 (5kHz frequency, 13-bit PWM resolution)
  - **Actinic UV**: GPIO19 (5kHz frequency, 13-bit PWM resolution)
  - **Electronics Cooling Fan**: GPIO4 (25kHz frequency, separate timer to prevent coil whine)
- **Timekeeping & Resilience**:
  - Primary: DS3231 battery-backed I2C RTC (GPIO21 SDA / GPIO22 SCL).
  - Background NTP opportunistic sync.
  - Fallback NVS state-holding upon unconfirmed boot + instant clock sync from phone over MQTT.
- **HiveMQ Cloud TLS MQTT**:
  - Secure TLS connection on port 8883 (device) and WSS port 8884 (web browser).
  - Retained state reporting, QoS 1 delivery, and LWT offline detection.
- **Professional Mobile-First Web Dashboard**:
  - Clean, high-contrast white & colorful design system.
  - **Live Spectrum Visualizer**: Computes real-time spectral power distribution (390nm – 700nm PAR) based on current channel mix + lab reference chart toggle.
  - **Interactive 24-Hour Curve Editor**: Multi-curve photoperiod graph with live scrubber inspection and instant fixture testing.
  - **Weekly Routing**: Assigns distinct autonomous schedule profiles per day of the week.
  - **Coral Acclimation Program**: Gradual linear scaling across 7–30 days to protect newly introduced corals.
  - **Safe Dual-Partition OTA**: Over-The-Air updates with automated health-check rollback.

---

## Project Structure

```
CreatorAquarium_ReefLight/
├── firmware/                   # PlatformIO ESP32 C++ firmware
│   ├── platformio.ini         # PlatformIO build configuration
│   ├── include/config.h       # Hardware pinouts & frequency parameters
│   ├── src/
│   │   ├── main.cpp           # System boot, WiFi captive portal, CLI
│   │   ├── ledc_driver.cpp    # 13-bit LEDC PWM & fan control
│   │   ├── rtc_time.cpp       # DS3231 RTC, NTP sync, fallback stack
│   │   ├── schedule_engine.cpp# FreeRTOS 1Hz autonomous interpolation
│   │   ├── storage_manager.cpp# LittleFS JSON storage & NVS prefs
│   │   ├── mqtt_manager.cpp   # HiveMQ TLS MQTT client & commands
│   │   ├── oled_display.cpp   # SSD1306 4-page status cycling display
│   │   └── ota_manager.cpp    # Streaming OTA updates & boot verification
│   └── test/
│       └── test_interpolation.js # Algorithmic interpolation test suite
└── web/                        # Next.js 14+ Mobile-First PWA
    ├── public/
    │   ├── manifest.json      # PWA manifest
    │   └── spectrum-reference.jpg # Scientific PAR spectrum reference
    └── src/
        ├── app/
        │   ├── globals.css    # Clean white & colorful design tokens
        │   ├── page.tsx       # Dashboard overview with live spectrum
        │   ├── manual/        # Tactile PWM sliders & quick profiles
        │   ├── schedules/     # 24h interactive photoperiod curve editor
        │   ├── weekly/        # 7-day schedule assignment calendar
        │   ├── acclimation/   # Coral acclimation ramp manager
        │   └── settings/      # Cloud broker credentials & OTA trigger
        ├── components/
        │   ├── SpectrumVisualizer.tsx # Dynamic PAR spectrum component
        │   ├── Navigation.tsx # Header & mobile bottom tab bar
        │   └── AuthGate.tsx   # Passcode access barrier
        └── lib/
            ├── MqttContext.tsx# Typed browser MQTT WSS connection
            └── types.ts       # Shared TypeScript data types
```

---

## Quick Start

### 1. Web Application
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:3000`. Default passcode: `reef1234`.

### 2. Flash ESP32 Firmware
```bash
cd firmware
pio run --target upload
pio device monitor -b 115200
```
On initial boot:
1. Connect phone or PC to WiFi AP `Reef-Light-Setup` (password: `reef1234`).
2. Input your WiFi SSID/password and HiveMQ Cloud broker credentials.
3. ESP32 connects, syncs time, and initiates autonomous schedule execution.
