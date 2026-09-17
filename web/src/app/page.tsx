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
  RotateCcw,
  Sparkles,
  ArrowRight,
  Sun,
  ShieldAlert,
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        setRemainingTimeStr('Auto-resuming');
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

  const displayTime = mounted && deviceState.time
    ? new Date(deviceState.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  const isMasterOn = deviceState.masterOn ?? true;
  const isManual = deviceState.mode === 'manual';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Simulation / Offline Banner (Minimal Apple Alert) */}
      {!isDeviceOnline && !isSimulated && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={16} color="#f59e0b" />
            <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>
              Device offline. Enable interactive demo?
            </span>
          </div>
          <button
            onClick={() => setSimulated(true)}
            className="btn-pill"
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem' }}
          >
            Demo Mode
          </button>
        </div>
      )}

      {/* Hero Master Power Card (Apple Home Style) */}
      <div
        className="card-surface"
        style={{
          padding: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: isMasterOn
            ? 'linear-gradient(135deg, rgba(22, 22, 28, 0.85) 0%, rgba(30, 35, 50, 0.75) 100%)'
            : 'var(--bg-glass-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: isMasterOn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.12)',
              color: isMasterOn ? '#10b981' : '#f43f5e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${isMasterOn ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.25)'}`,
              boxShadow: isMasterOn ? '0 0 16px -2px rgba(16, 185, 129, 0.3)' : 'none',
              transition: 'all 0.25s ease',
            }}
          >
            <Power size={22} strokeWidth={2.4} />
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Master Light Output
            </div>
            <div style={{ fontSize: '0.75rem', color: isMasterOn ? '#10b981' : 'var(--text-muted)', fontWeight: 600 }}>
              {isMasterOn ? 'System Online & Emitting' : 'Outputs Held at 0%'}
            </div>
          </div>
        </div>

        <label className="apple-toggle">
          <input
            type="checkbox"
            checked={isMasterOn}
            onChange={handleMasterToggle}
            id="master-switch"
          />
          <span className="apple-toggle-track" />
        </label>
      </div>

      {/* Operating Status & Schedule Info */}
      <div
        className="card-surface"
        style={{
          padding: '1.1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={15} color="#38bdf8" />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Schedule</span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.12)',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              {deviceState.activeScheduleId || 'natural_reef'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            <Clock size={13} />
            <span suppressHydrationWarning>{displayTime}</span>
          </div>
        </div>

        {isManual ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.65rem',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#f59e0b',
                  background: 'rgba(245, 158, 11, 0.15)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                MANUAL HOLD
              </span>
              {remainingTimeStr && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Auto-reverts in <strong style={{ color: 'var(--text-secondary)' }}>{remainingTimeStr}</strong>
                </span>
              )}
            </div>

            <button
              onClick={handleRevertToAuto}
              className="btn-pill"
              id="resume-auto-btn"
              style={{
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <RotateCcw size={12} /> Resume Auto
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.65rem',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
            }}
          >
            <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className="status-glow-dot" style={{ background: '#10b981' }} /> Autonomous Schedule Active
            </span>
            <Link
              href="/manual"
              style={{
                color: '#38bdf8',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              Manual Controls <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </div>

      {/* Light Spectrum Visualizer (Live calculated PAR curve) */}
      <SpectrumVisualizer channels={deviceState.live} />

      {/* 4-Channel Live Output Bento Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', padding: '0 0.2rem' }}>
          <h2 style={{ fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Live Channel Levels
          </h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>3-Channel + Fan</span>
        </div>

        <div className="channels-grid">
          {/* Royal Blue */}
          <div
            className="channel-card"
            style={{
              background: 'linear-gradient(145deg, rgba(22, 22, 26, 0.8) 0%, rgba(30, 42, 68, 0.4) 100%)',
              borderColor: 'rgba(59, 130, 246, 0.25)',
            }}
          >
            <div className="channel-card-header">
              <div>
                <span className="channel-name" style={{ color: '#60a5fa' }}>
                  Royal Blue
                </span>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  450nm • 10 LEDs
                </div>
              </div>
              <span className="channel-pct">{Math.round(deviceState.live.blue)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{
                  width: `${deviceState.live.blue}%`,
                  backgroundColor: '#3b82f6',
                  color: '#3b82f6',
                }}
              />
            </div>
          </div>

          {/* Day White */}
          <div
            className="channel-card"
            style={{
              background: 'linear-gradient(145deg, rgba(22, 22, 26, 0.8) 0%, rgba(30, 48, 56, 0.4) 100%)',
              borderColor: 'rgba(56, 189, 248, 0.25)',
            }}
          >
            <div className="channel-card-header">
              <div>
                <span className="channel-name" style={{ color: '#38bdf8' }}>
                  Day White
                </span>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  6500K • 4 LEDs
                </div>
              </div>
              <span className="channel-pct">{Math.round(deviceState.live.white)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{
                  width: `${deviceState.live.white}%`,
                  backgroundColor: '#38bdf8',
                  color: '#38bdf8',
                }}
              />
            </div>
          </div>

          {/* Actinic UV */}
          <div
            className="channel-card"
            style={{
              background: 'linear-gradient(145deg, rgba(22, 22, 26, 0.8) 0%, rgba(48, 30, 68, 0.4) 100%)',
              borderColor: 'rgba(168, 85, 247, 0.25)',
            }}
          >
            <div className="channel-card-header">
              <div>
                <span className="channel-name" style={{ color: '#c084fc' }}>
                  Actinic UV
                </span>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  405nm • 2 LEDs
                </div>
              </div>
              <span className="channel-pct">{Math.round(deviceState.live.uv)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{
                  width: `${deviceState.live.uv}%`,
                  backgroundColor: '#a855f7',
                  color: '#a855f7',
                }}
              />
            </div>
          </div>

          {/* Cooling Fan */}
          <div
            className="channel-card"
            style={{
              background: 'linear-gradient(145deg, rgba(22, 22, 26, 0.8) 0%, rgba(20, 48, 44, 0.4) 100%)',
              borderColor: 'rgba(20, 184, 166, 0.25)',
            }}
          >
            <div className="channel-card-header">
              <div>
                <span className="channel-name" style={{ color: '#2dd4bf' }}>
                  Cooling Fan
                </span>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Active Thermal Fan
                </div>
              </div>
              <span className="channel-pct">{Math.round(deviceState.live.fan)}%</span>
            </div>
            <div className="channel-meter-track">
              <div
                className="channel-meter-fill"
                style={{
                  width: `${deviceState.live.fan}%`,
                  backgroundColor: '#14b8a6',
                  color: '#14b8a6',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Acclimation Quick Status (If Active) */}
      {deviceState.acclimation?.active && (
        <div
          className="card-surface"
          style={{
            padding: '1rem 1.2rem',
            background: 'linear-gradient(135deg, rgba(48, 30, 68, 0.6) 0%, rgba(22, 22, 26, 0.8) 100%)',
            borderColor: 'rgba(168, 85, 247, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Sparkles size={18} color="#c084fc" />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Coral Acclimation Program Active
              </div>
              <div style={{ fontSize: '0.72rem', color: '#c084fc' }}>
                Starting at {deviceState.acclimation.startPct}% • {deviceState.acclimation.daysTotal} days duration
              </div>
            </div>
          </div>
          <Link href="/acclimation" className="btn-pill" style={{ fontSize: '0.72rem' }}>
            View Program →
          </Link>
        </div>
      )}
    </div>
  );
}
