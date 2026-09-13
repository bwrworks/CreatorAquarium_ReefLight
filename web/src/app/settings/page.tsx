'use client';

import React, { useState } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { useAuth } from '../../lib/AuthContext';
import {
  Cloud,
  Clock,
  ArrowUpCircle,
  Lock,
  Check,
  Save,
  Smartphone,
  Zap,
} from 'lucide-react';

export default function SettingsPage() {
  const { config, saveConfig, publishOta, publishTime, isSimulated, setSimulated } = useDeviceMqtt();
  const { logout } = useAuth();

  const [brokerUrl, setBrokerUrl] = useState(config.brokerUrl);
  const [username, setUsername] = useState(config.username || '');
  const [password, setPassword] = useState(config.password || '');
  const [deviceId, setDeviceId] = useState(config.deviceId);
  const [configSaved, setConfigSaved] = useState(false);

  const [timezone, setTimezone] = useState('Asia/Kolkata (UTC+05:30)');
  const [overrideTimeoutHours, setOverrideTimeoutHours] = useState(2);
  const [timeSyncSuccess, setTimeSyncSuccess] = useState(false);

  const [otaUrl, setOtaUrl] = useState('');
  const [otaTriggered, setOtaTriggered] = useState(false);

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
    if (!otaUrl.trim()) return;
    if (confirm(`Initiate Over-The-Air firmware update from:\n${otaUrl}\n\nESP32 will download, flash, and verify boot health.`)) {
      publishOta(otaUrl);
      setOtaTriggered(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div className="card-surface" style={{ padding: '1.15rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.02em' }}>
          Device & Cloud Settings
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
          Configure HiveMQ Cloud broker parameters, timekeeping synchronization & firmware updates
        </p>
      </div>

      {/* Cloud Broker Configuration */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Cloud size={18} color="#0284c7" />
          <h3 style={{ fontSize: '0.84rem', fontWeight: 700, color: '#09090b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            HiveMQ Cloud MQTT (WSS)
          </h3>
        </div>

        <form onSubmit={handleSaveBrokerConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              Broker WebSocket URL
            </label>
            <input
              type="text"
              value={brokerUrl}
              onChange={(e) => setBrokerUrl(e.target.value)}
              placeholder="wss://your-broker.s1.eu.hivemq.cloud:8884/mqtt"
              style={{
                width: '100%',
                background: '#ffffff',
                color: '#09090b',
                border: '1px solid #cbd5e1',
                padding: '0.6rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                style={{
                  width: '100%',
                  background: '#ffffff',
                  color: '#09090b',
                  border: '1px solid #cbd5e1',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                style={{
                  width: '100%',
                  background: '#ffffff',
                  color: '#09090b',
                  border: '1px solid #cbd5e1',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              Target Device ID
            </label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="reef-esp32-01"
              style={{
                width: '100%',
                background: '#ffffff',
                color: '#09090b',
                border: '1px solid #cbd5e1',
                padding: '0.6rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
              }}
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

      {/* Timekeeping & Direct Clock Push */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
          <Clock size={18} color="#0284c7" />
          <h3 style={{ fontSize: '0.84rem', fontWeight: 700, color: '#09090b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Timekeeping Synchronization (NFR-4)
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              Device Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{
                width: '100%',
                background: '#ffffff',
                color: '#09090b',
                border: '1px solid #cbd5e1',
                padding: '0.6rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <option value="Asia/Kolkata (UTC+05:30)">Asia/Kolkata (UTC+05:30) [Default]</option>
              <option value="UTC">UTC (+00:00)</option>
              <option value="America/New_York (UTC-05:00)">America/New_York (UTC-05:00)</option>
              <option value="Europe/London (UTC+00:00)">Europe/London (UTC+00:00)</option>
              <option value="Australia/Sydney (UTC+10:00)">Australia/Sydney (UTC+10:00)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
              Manual Override Timeout Duration
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[1, 2, 4, 8].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setOverrideTimeoutHours(h)}
                  className={`btn-secondary ${overrideTimeoutHours === h ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    fontSize: '0.78rem',
                    padding: '0.4rem',
                  }}
                >
                  {h} Hour{h > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={handlePushCurrentTime}
              className="btn-secondary"
              id="sync-time-btn"
              style={{ width: '100%', fontSize: '0.82rem' }}
            >
              {timeSyncSuccess ? (
                <>
                  <Check size={16} color="#059669" /> Device Clock Synced!
                </>
              ) : (
                <>
                  <Smartphone size={16} /> Sync ESP32 Clock from This Device
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Demo Simulation Switch */}
      <div className="card-surface" style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#09090b' }}>Demo Simulation Mode</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Test all sliders and UI controls in browser without physical hardware
          </div>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={isSimulated}
            onChange={(e) => setSimulated(e.target.checked)}
            id="demo-mode-toggle"
          />
          <span className="toggle-slider" />
        </label>
      </div>

      {/* OTA Update */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <ArrowUpCircle size={18} color="#0284c7" />
          <h3 style={{ fontSize: '0.84rem', fontWeight: 700, color: '#09090b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Over-The-Air Firmware Update (FR-20)
          </h3>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
          Dual-partition safe updates with automated rollback if health check fails
        </p>

        <form onSubmit={handleTriggerOta} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <input
            type="url"
            value={otaUrl}
            onChange={(e) => setOtaUrl(e.target.value)}
            placeholder="https://example.com/firmware.bin"
            style={{
              width: '100%',
              background: '#ffffff',
              color: '#09090b',
              border: '1px solid #cbd5e1',
              padding: '0.6rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
            }}
          />
          <button
            type="submit"
            className="btn-secondary"
            id="trigger-ota-btn"
            style={{ color: '#0284c7', borderColor: '#bae6fd' }}
          >
            {otaTriggered ? 'Update Signal Transmitted...' : 'Initiate OTA Firmware Update'}
          </button>
        </form>
      </div>

      {/* Lock App */}
      <div style={{ padding: '0.5rem 0' }}>
        <button
          onClick={logout}
          className="btn-secondary"
          id="lock-app-btn"
          style={{ width: '100%', color: '#dc2626', borderColor: '#fecaca' }}
        >
          <Lock size={15} /> Lock Application
        </button>
      </div>
    </div>
  );
}
