'use client';

import React, { useState, useEffect } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import {
  Cloud,
  Clock,
  ArrowUpCircle,
  Lock,
  Check,
  Save,
  Smartphone,
  Cpu,
  Fan,
  Sun,
  ChevronDown,
  ChevronUp,
  Settings,
} from 'lucide-react';

export default function SettingsPage() {
  const {
    config,
    saveConfig,
    publishOta,
    publishTime,
    deviceState,
    publishFanPolarity,
    publishFan,
    publishDisplayBrightness,
    isSimulated,
    setSimulated,
    logout,
  } = useDeviceMqtt();

  const [brokerUrl, setBrokerUrl] = useState(config.brokerUrl);
  const [username, setUsername] = useState(config.username || '');
  const [password, setPassword] = useState(config.password || '');
  const [deviceId, setDeviceId] = useState(config.deviceId);
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    if (config.brokerUrl) setBrokerUrl(config.brokerUrl);
    if (config.username) setUsername(config.username);
    if (config.password) setPassword(config.password);
    if (config.deviceId) setDeviceId(config.deviceId);
  }, [config.brokerUrl, config.username, config.password, config.deviceId]);

  const [timezone, setTimezone] = useState('Asia/Kolkata (UTC+05:30)');
  const [timeSyncSuccess, setTimeSyncSuccess] = useState(false);
  const [fanPolSuccess, setFanPolSuccess] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Display brightness state (0-255)
  const currentBrightness = deviceState.displayBrightness ?? 255;
  const [localBrightness, setLocalBrightness] = useState(currentBrightness);

  useEffect(() => {
    if (deviceState.displayBrightness !== undefined) {
      setLocalBrightness(deviceState.displayBrightness);
    }
  }, [deviceState.displayBrightness]);

  const handleDisplayBrightnessChange = (val: number) => {
    setLocalBrightness(val);
    publishDisplayBrightness(val);
  };

  const handleToggleFanPolarity = (inverted: boolean) => {
    publishFanPolarity(inverted);
    setFanPolSuccess(true);
    setTimeout(() => setFanPolSuccess(false), 2500);
  };

  // OTA
  const [otaUrl, setOtaUrl] = useState('');
  const [otaSha256, setOtaSha256] = useState('');
  const [otaTriggered, setOtaTriggered] = useState(false);
  const [otaError, setOtaError] = useState('');

  const handleSaveBrokerConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig({
      brokerUrl,
      username,
      password,
      deviceId,
    });
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  };

  const handlePushCurrentTime = () => {
    const nowIso = new Date().toISOString();
    publishTime(nowIso);
    setTimeSyncSuccess(true);
    setTimeout(() => setTimeSyncSuccess(false), 2500);
  };

  const handleTriggerOta = (e: React.FormEvent) => {
    e.preventDefault();
    setOtaError('');

    if (!otaUrl.trim().startsWith('https://')) {
      setOtaError('URL must use secure HTTPS protocol.');
      return;
    }

    const cleanSha = otaSha256.trim().toLowerCase();
    if (cleanSha.length !== 64 || !/^[0-9a-f]{64}$/.test(cleanSha)) {
      setOtaError('A valid 64-character SHA-256 hex digest is mandatory.');
      return;
    }

    if (
      confirm(
        `Initiate Over-The-Air firmware update from:\n${otaUrl}\n\nSHA-256: ${cleanSha}\n\nESP32 will download, verify hash, flash, and verify boot health.`
      )
    ) {
      publishOta(otaUrl, cleanSha);
      setOtaTriggered(true);
    }
  };

  const brightnessPercent = Math.round((localBrightness / 255) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Device & Hardware Settings
        </h2>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          Display backlight, cooling fan PWM polarity, and system configurations
        </p>
      </div>

      {/* 1. TFT Display Backlight Brightness Control (LEDC PWM Channel 5) */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Sun size={18} color="#38bdf8" />
            <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              TFT Display Backlight
            </h3>
          </div>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontFamily: 'monospace',
            }}
          >
            {brightnessPercent}% ({localBrightness}/255)
          </span>
        </div>

        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.9rem', lineHeight: 1.45 }}>
          Adjust the 1.44&quot; on-fixture color TFT screen brightness. Backlight dimming uses dedicated hardware PWM (GPIO 26, 5 kHz) with debounced NVS flash saving.
        </p>

        {/* Range Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.85rem' }}>
          <Sun size={15} color="var(--text-dim)" />
          <input
            type="range"
            min="10"
            max="255"
            step="5"
            value={localBrightness}
            onChange={(e) => handleDisplayBrightnessChange(parseInt(e.target.value, 10))}
            style={{
              flex: 1,
              accentColor: '#38bdf8',
              cursor: 'pointer',
              height: '6px',
            }}
          />
          <Sun size={20} color="#38bdf8" />
        </div>

        {/* Quick Brightness Presets */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {[
            { label: '25% (Dim)', val: 64 },
            { label: '50% (Medium)', val: 128 },
            { label: '75% (Bright)', val: 192 },
            { label: '100% (Max)', val: 255 },
          ].map((preset) => (
            <button
              key={preset.val}
              type="button"
              onClick={() => handleDisplayBrightnessChange(preset.val)}
              className={`btn-pill ${Math.abs(localBrightness - preset.val) <= 15 ? 'active' : ''}`}
              style={{ fontSize: '0.68rem', padding: '0.22rem 0.55rem' }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Cooling Fan Hardware Signal & Polarity (GPIO 4) */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Fan size={18} color="#2dd4bf" />
            <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Cooling Fan Hardware Signal
            </h3>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: 'var(--radius-full)',
              background: deviceState.fanInverted ? 'rgba(245, 158, 11, 0.15)' : 'rgba(45, 212, 191, 0.15)',
              color: deviceState.fanInverted ? '#fbbf24' : '#2dd4bf',
              border: deviceState.fanInverted ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(45, 212, 191, 0.3)',
            }}
          >
            {deviceState.fanInverted ? 'Inverted (Optocoupler)' : 'Normal (Active-High)'}
          </span>
        </div>

        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.9rem', lineHeight: 1.45 }}>
          If your fan runs full speed when set to 0%, your board uses an active-low optocoupler or inverted MOSFET stage. Toggle below to match:
        </p>

        {/* Responsive buttons: Grid prevents overflow on 320px-360px mobile viewports */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.55rem',
            width: '100%',
            marginBottom: '0.85rem',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            onClick={() => handleToggleFanPolarity(false)}
            className={`btn-secondary ${!deviceState.fanInverted ? 'active' : ''}`}
            style={{ fontSize: '0.76rem', padding: '0.55rem 0.4rem', textAlign: 'center' }}
          >
            Normal (Active-High FET)
          </button>
          <button
            type="button"
            onClick={() => handleToggleFanPolarity(true)}
            className={`btn-secondary ${deviceState.fanInverted ? 'active' : ''}`}
            style={{ fontSize: '0.76rem', padding: '0.55rem 0.4rem', textAlign: 'center' }}
          >
            Inverted (Optocoupler)
          </button>
        </div>

        {/* Quick Instant Test Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-dim)', marginRight: '0.2rem' }}>
            Instant Test:
          </span>
          <button
            type="button"
            onClick={() => publishFan(0)}
            className="btn-pill"
            style={{ fontSize: '0.68rem', padding: '0.2rem 0.55rem' }}
          >
            0% (Stop)
          </button>
          <button
            type="button"
            onClick={() => publishFan(50)}
            className="btn-pill"
            style={{ fontSize: '0.68rem', padding: '0.2rem 0.55rem' }}
          >
            50% (Medium)
          </button>
          <button
            type="button"
            onClick={() => publishFan(100)}
            className="btn-pill"
            style={{ fontSize: '0.68rem', padding: '0.2rem 0.55rem' }}
          >
            100% (Full)
          </button>
          {fanPolSuccess && (
            <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Check size={12} /> Saved to ESP32!
            </span>
          )}
        </div>
      </div>

      {/* 3. Demo Mode Switch */}
      <div className="card-surface" style={{ padding: '1.15rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Demo Simulation Mode</div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            Preview sliders and spectrum without hardware connection
          </div>
        </div>
        <label className="apple-toggle">
          <input
            type="checkbox"
            checked={isSimulated}
            onChange={(e) => setSimulated(e.target.checked)}
            id="demo-mode-toggle"
          />
          <span className="apple-toggle-track" />
        </label>
      </div>

      {/* 4. Collapsible Advanced System Settings Section */}
      <div className="card-surface" style={{ overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setIsAdvancedOpen((prev) => !prev)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.15rem 1.25rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Settings size={18} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Advanced System Configuration
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                HiveMQ broker credentials, hardware specs, clock sync & OTA updates
              </div>
            </div>
          </div>
          {isAdvancedOpen ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
        </button>

        {isAdvancedOpen && (
          <div style={{ padding: '0 1.25rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
            {/* Cloud Broker Configuration */}
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.75rem' }}>
                <Cloud size={16} color="#38bdf8" />
                <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  HiveMQ Cloud MQTT (WSS)
                </h4>
              </div>

              <form onSubmit={handleSaveBrokerConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                    Broker WebSocket URL
                  </label>
                  <input
                    type="text"
                    value={brokerUrl}
                    onChange={(e) => setBrokerUrl(e.target.value)}
                    placeholder="wss://your-broker.s1.eu.hivemq.cloud:8884/mqtt"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                    Device ID
                  </label>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="reef-esp32-01"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <button type="submit" className="btn-primary" id="save-broker-btn" style={{ marginTop: '0.25rem' }}>
                  {configSaved ? (
                    <>
                      <Check size={15} /> Saved Successfully
                    </>
                  ) : (
                    <>
                      <Save size={15} /> Save Broker Configuration
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Timekeeping & Clock Push */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.75rem' }}>
                <Clock size={16} color="#38bdf8" />
                <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Timekeeping Synchronization
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                    Device Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="Asia/Kolkata (UTC+05:30)">Asia/Kolkata (UTC+05:30) [Default]</option>
                    <option value="UTC">UTC (+00:00)</option>
                    <option value="America/New_York (UTC-05:00)">America/New_York (UTC-05:00)</option>
                    <option value="Europe/London (UTC+00:00)">Europe/London (UTC+00:00)</option>
                    <option value="Australia/Sydney (UTC+10:00)">Australia/Sydney (UTC+10:00)</option>
                  </select>
                </div>

                <button
                  onClick={handlePushCurrentTime}
                  className="btn-secondary"
                  id="sync-time-btn"
                  style={{ width: '100%', fontSize: '0.78rem', padding: '0.55rem' }}
                >
                  {timeSyncSuccess ? (
                    <>
                      <Check size={14} color="#10b981" /> Clock Synced with Hardware!
                    </>
                  ) : (
                    <>
                      <Smartphone size={14} /> Sync Hardware Clock to Current Time
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Hardware Profile Spec Sheet */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.65rem' }}>
                <Cpu size={16} color="#38bdf8" />
                <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Hardware Configuration Profile
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.74rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Royal Blue (10x LEDs)</span>
                  <span style={{ color: '#60a5fa', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 18 [6x] + GPIO 19 [4x]</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Day White (4x LEDs)</span>
                  <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 32 • 6500K</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Actinic UV (2x LEDs)</span>
                  <span style={{ color: '#c084fc', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 33 • 405nm</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Thermal Cooling Fan</span>
                  <span style={{ color: '#2dd4bf', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 4 • 1 kHz PWM</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>1.44&quot; TFT Display Backlight</span>
                  <span style={{ color: '#fbbf24', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 26 • 5 kHz PWM (Ch 5)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
                  <span style={{ color: 'var(--text-muted)' }}>LED Frequency / Resolution</span>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'monospace' }}>1 kHz • 12-bit Precision (4095)</span>
                </div>
              </div>
            </div>

            {/* OTA Update */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.65rem' }}>
                <ArrowUpCircle size={16} color="#38bdf8" />
                <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Over-The-Air Firmware Update (OTA)
                </h4>
              </div>

              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                Dual-partition fail-safe flashing with automated SHA-256 verification and rollback
              </p>

              <form onSubmit={handleTriggerOta} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                    Firmware Binary HTTPS URL
                  </label>
                  <input
                    type="url"
                    value={otaUrl}
                    onChange={(e) => setOtaUrl(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/bwrworks/CreatorAquarium_ReefLight/main/firmware/releases/firmware.bin"
                    required
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                    Mandatory SHA-256 Checksum
                  </label>
                  <input
                    type="text"
                    value={otaSha256}
                    onChange={(e) => setOtaSha256(e.target.value)}
                    placeholder="64 hex characters"
                    required
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.73rem', boxSizing: 'border-box' }}
                  />
                </div>

                {otaError && (
                  <div style={{ color: '#f43f5e', fontSize: '0.74rem', fontWeight: 600 }}>
                    {otaError}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-secondary"
                  id="trigger-ota-btn"
                  style={{ marginTop: '0.2rem' }}
                >
                  {otaTriggered ? 'OTA Signal Transmitted to ESP32...' : 'Transmit Verified OTA Signal'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* 5. Lock App */}
      <div style={{ padding: '0.25rem 0 1rem 0' }}>
        <button
          onClick={logout}
          className="btn-secondary"
          id="lock-app-btn"
          style={{ width: '100%', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)', background: 'rgba(244, 63, 94, 0.08)' }}
        >
          <Lock size={15} /> Lock Application
        </button>
      </div>
    </div>
  );
}
