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
} from 'lucide-react';

export default function SettingsPage() {
  const { config, saveConfig, publishOta, publishTime, isSimulated, setSimulated, logout } = useDeviceMqtt();

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

    if (confirm(`Initiate Over-The-Air firmware update from:\n${otaUrl}\n\nSHA-256: ${cleanSha}\n\nESP32 will download, verify hash, flash, and verify boot health.`)) {
      publishOta(otaUrl, cleanSha);
      setOtaTriggered(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Device & System Settings
        </h2>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          HiveMQ Cloud broker credentials, clock synchronization, hardware info & OTA firmware updates
        </p>
      </div>

      {/* Hardware Profile Spec Sheet (Tucked elegantly here instead of cluttering dashboard) */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.85rem' }}>
          <Cpu size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Hardware Configuration Profile
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.76rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Royal Blue Channel (10x LEDs)</span>
            <span style={{ color: '#60a5fa', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 18 [6x] + GPIO 19 [4x]</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Day White Channel (4x LEDs)</span>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 32 • 6500K</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Actinic UV Channel (2x LEDs)</span>
            <span style={{ color: '#c084fc', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 33 • 405nm</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Thermal Cooling Fan</span>
            <span style={{ color: '#2dd4bf', fontWeight: 700, fontFamily: 'monospace' }}>GPIO 4 • 25kHz PWM</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0' }}>
            <span style={{ color: 'var(--text-muted)' }}>LEDC PWM Resolution</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'monospace' }}>5kHz Frequency • 13-bit Precision</span>
          </div>
        </div>
      </div>

      {/* Cloud Broker Configuration */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1rem' }}>
          <Cloud size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            HiveMQ Cloud MQTT (WSS)
          </h3>
        </div>

        <form onSubmit={handleSaveBrokerConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
              Broker WebSocket URL
            </label>
            <input
              type="text"
              value={brokerUrl}
              onChange={(e) => setBrokerUrl(e.target.value)}
              placeholder="wss://your-broker.s1.eu.hivemq.cloud:8884/mqtt"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
              Device ID
            </label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="reef-esp32-01"
              style={{ width: '100%' }}
            />
          </div>

          <button type="submit" className="btn-primary" id="save-broker-btn" style={{ marginTop: '0.35rem' }}>
            {configSaved ? (
              <>
                <Check size={16} /> Saved Successfully
              </>
            ) : (
              <>
                <Save size={16} /> Save Broker Configuration
              </>
            )}
          </button>
        </form>
      </div>

      {/* Timekeeping & Clock Push */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.9rem' }}>
          <Clock size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Timekeeping Synchronization
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
              Device Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{ width: '100%' }}
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
            style={{ width: '100%', fontSize: '0.8rem', padding: '0.65rem' }}
          >
            {timeSyncSuccess ? (
              <>
                <Check size={15} color="#10b981" /> Clock Synced with Hardware!
              </>
            ) : (
              <>
                <Smartphone size={15} /> Sync Hardware Clock to Current Time
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Demo Simulation Switch */}
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

      {/* OTA Update */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.75rem' }}>
          <ArrowUpCircle size={18} color="#38bdf8" />
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Over-The-Air Firmware (OTA)
          </h3>
        </div>

        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Dual-partition fail-safe flashing with automated SHA-256 verification and rollback
        </p>

        <form onSubmit={handleTriggerOta} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
              Firmware Binary HTTPS URL
            </label>
            <input
              type="url"
              value={otaUrl}
              onChange={(e) => setOtaUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/user/repo/releases/firmware.bin"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
              Mandatory SHA-256 Checksum
            </label>
            <input
              type="text"
              value={otaSha256}
              onChange={(e) => setOtaSha256(e.target.value)}
              placeholder="64 hex characters"
              required
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
          </div>

          {otaError && (
            <div style={{ color: '#f43f5e', fontSize: '0.76rem', fontWeight: 600 }}>
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

      {/* Lock App */}
      <div style={{ padding: '0.5rem 0' }}>
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
