'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDeviceMqtt } from '../lib/MqttContext';
import { SpectrumVisualizer } from '../components/SpectrumVisualizer';
import {
  Power,
  Clock,
  Calendar,
  Fan,
  Sliders,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Zap,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

export default function DashboardPage() {
  const {
    deviceState,
    isDeviceOnline,
    publishMaster,
    publishMode,
    isSimulated,
    setSimulated,
  } = useDeviceMqtt();

  const [remainingTimeStr, setRemainingTimeStr] = useState<string>('');

  useEffect(() => {
    if (deviceState.mode !== 'manual' || !deviceState.manualOverrideExpiresAt) {
      setRemainingTimeStr('');
      return;
    }

    const interval = setInterval(() => {
      const expiry = new Date(deviceState.manualOverrideExpiresAt!).getTime();
      const now = Date.now();
      const diff = expiry - now;

      if (diff <= 0) {
        setRemainingTimeStr('Expiring');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setRemainingTimeStr(`${mins}m ${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deviceState.mode, deviceState.manualOverrideExpiresAt]);

  const handleMasterToggle = () => {
    const current = deviceState.masterOn ?? true;
    publishMaster(!current);
  };

  const handleRevertToAuto = () => {
    publishMode('auto');
  };

  const displayTime = deviceState.time
    ? new Date(deviceState.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Simulation Mode Banner if active or if broker disconnected */}
      {!isDeviceOnline && !isSimulated && (
        <div
          className="card-surface"
          style={{
            borderColor: '#fde68a',
            background: '#fffbeb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.8rem 1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <AlertTriangle size={17} color="#d97706" />
            <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
              Broker offline. Enable interactive demo mode?
            </span>
          </div>
          <button
            onClick={() => setSimulated(true)}
            className="btn-secondary"
            style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem' }}
          >
            Enable Demo
          </button>
        </div>
      )}

      {isSimulated && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.45rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1d4ed8',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Zap size={13} /> Simulation Active: Live in-browser response mode
          </span>
          <button
            onClick={() => setSimulated(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '0.72rem',
            }}
          >
            Exit Demo
          </button>
        </div>
      )}

      {/* Master LED Control Card */}
      <div className="master-switch-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: (deviceState.masterOn ?? true) ? '#ecfdf5' : '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: (deviceState.masterOn ?? true) ? '#059669' : '#dc2626',
              border: `1px solid ${(deviceState.masterOn ?? true) ? '#a7f3d0' : '#fecaca'}`,
            }}
          >
            <Power size={19} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#09090b' }}>Master LED Output</div>
            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
              {(deviceState.masterOn ?? true) ? 'Active (Output enabled)' : 'Forced 0% (Schedule running in background)'}
            </div>
          </div>
        </div>

        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={deviceState.masterOn ?? true}
            onChange={handleMasterToggle}
            id="master-switch"
          />
          <span className="toggle-slider" />
        </label>
      </div>

      {/* Operating Status Card */}
      <div
        className="card-surface"
        style={{
          padding: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          borderLeft: deviceState.mode === 'manual' ? '4px solid #d97706' : '4px solid #0284c7',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={16} color="#0284c7" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Active Schedule:</span>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#0369a1',
                background: '#f0f9ff',
                padding: '0.15rem 0.55rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #bae6fd',
              }}
            >
              {deviceState.activeScheduleId}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            <Clock size={14} />
            <span>{displayTime}</span>
          </div>
        </div>

        {deviceState.mode === 'manual' ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.5rem',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#b45309',
                  background: '#fffbeb',
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid #fde68a',
                }}
              >
                MANUAL OVERRIDE
              </span>
              {remainingTimeStr && (
                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  Auto-reverts in <strong>{remainingTimeStr}</strong>
                </span>
              )}
            </div>

            <button
              onClick={handleRevertToAuto}
              className="btn-secondary"
              id="resume-auto-btn"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            >
              <RotateCcw size={13} /> Resume Auto
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.5rem',
              borderTop: '1px solid #f1f5f9',
              fontSize: '0.76rem',
              color: '#64748b',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#059669', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Autonomous Schedule Active
            </span>
            <Link href="/manual" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              Manual Overrides <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </div>

      {/* 4-Channel Live Output Cards */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <h2 style={{ fontSize: '0.84rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b' }}>
            Live Channel Levels
          </h2>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>LEDC 5kHz 13-bit</span>
        </div>

        <div className="channels-grid">
          {/* Royal Blue */}
          <div className="channel-card blue">
            <div className="channel-card-header">
              <span className="channel-name" style={{ color: 'var(--channel-blue)' }}>
                Royal Blue
              </span>
              <span className="channel-pct">{Math.round(deviceState.live.blue)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{ width: `${deviceState.live.blue}%`, backgroundColor: 'var(--channel-blue)' }}
              />
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>450nm Peak</span>
              <span>GPIO32</span>
            </div>
          </div>

          {/* Day White */}
          <div className="channel-card white">
            <div className="channel-card-header">
              <span className="channel-name" style={{ color: 'var(--channel-white)' }}>
                Day White
              </span>
              <span className="channel-pct">{Math.round(deviceState.live.white)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{ width: `${deviceState.live.white}%`, backgroundColor: 'var(--channel-white)' }}
              />
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>6500K CRI</span>
              <span>GPIO18</span>
            </div>
          </div>

          {/* Deep Red */}
          <div className="channel-card red">
            <div className="channel-card-header">
              <span className="channel-name" style={{ color: 'var(--channel-red)' }}>
                Deep Red
              </span>
              <span className="channel-pct">{Math.round(deviceState.live.red)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{ width: `${deviceState.live.red}%`, backgroundColor: 'var(--channel-red)' }}
              />
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>660nm Peak</span>
              <span>GPIO33</span>
            </div>
          </div>

          {/* Actinic UV */}
          <div className="channel-card uv">
            <div className="channel-card-header">
              <span className="channel-name" style={{ color: 'var(--channel-uv)' }}>
                Actinic UV
              </span>
              <span className="channel-pct">{Math.round(deviceState.live.uv)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{ width: `${deviceState.live.uv}%`, backgroundColor: 'var(--channel-uv)' }}
              />
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>405nm Peak</span>
              <span>GPIO19</span>
            </div>
          </div>
        </div>
      </div>

      {/* Light Spectrum Visualizer (Live calculated PAR curve + Lab Reference Chart) */}
      <SpectrumVisualizer channels={deviceState.live} />

      {/* Fan & Acclimation Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {/* Fan Status */}
        <div className="card-surface" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Fan size={16} color="var(--channel-fan)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090b' }}>Cooling Fan</span>
            </div>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090b' }}>
              {Math.round(deviceState.live.fan)}%
            </span>
          </div>
          <div className="channel-meter-track">
            <div
              className="channel-meter-fill"
              style={{ width: `${deviceState.live.fan}%`, backgroundColor: 'var(--channel-fan)' }}
            />
          </div>
          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>PWM 25kHz • GPIO4</span>
        </div>

        {/* Acclimation Status */}
        <div className="card-surface" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Sparkles size={16} color="var(--channel-uv)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090b' }}>Acclimation</span>
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '0.15rem 0.45rem',
                borderRadius: 'var(--radius-sm)',
                background: deviceState.acclimation?.active ? 'var(--channel-uv-bg)' : '#f1f5f9',
                color: deviceState.acclimation?.active ? 'var(--channel-uv)' : '#64748b',
                border: `1px solid ${deviceState.acclimation?.active ? 'var(--channel-uv-border)' : '#e2e8f0'}`,
              }}
            >
              {deviceState.acclimation?.active ? 'ACTIVE' : 'OFF'}
            </span>
          </div>
          {deviceState.acclimation?.active ? (
            <div style={{ fontSize: '0.72rem', color: '#475569' }}>
              Scaling from {deviceState.acclimation.startPct}% ({deviceState.acclimation.daysTotal} days)
            </div>
          ) : (
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Standard 100% intensity</div>
          )}
          <Link href="/acclimation" style={{ fontSize: '0.72rem', color: '#7c3aed', textDecoration: 'none', fontWeight: 600, marginTop: 'auto' }}>
            Configure →
          </Link>
        </div>
      </div>
    </div>
  );
}
