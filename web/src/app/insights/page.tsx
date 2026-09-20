'use client';

import React, { useMemo } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import {
  Activity,
  Sun,
  Moon,
  Fan,
  Cpu,
  Wifi,
  Cloud,
  Clock,
  ShieldCheck,
  Zap,
  Gauge,
  Info,
} from 'lucide-react';

export default function InsightsPage() {
  const { deviceState, isDeviceOnline, isBrokerConnected, lastSeen } = useDeviceMqtt();

  const live = deviceState.live;
  const totalIntensity = useMemo(() => {
    return Math.round((live.blue + live.white + live.uv) / 3);
  }, [live]);

  // Current Photoperiod Phase calculation based on device clock
  const photoperiodPhase = useMemo(() => {
    if (!deviceState.time) return { label: 'Autonomous Cycle', desc: 'Syncing system clock', icon: Sun, pctOfDay: 50 };

    const date = new Date(deviceState.time);
    const hour = date.getHours() + date.getMinutes() / 60;
    const pctOfDay = Math.min(100, Math.max(0, (hour / 24) * 100));

    if (hour >= 0 && hour < 7.5) {
      return { label: 'Night Moon Phase', desc: 'Deep rest period for marine invertebrates', icon: Moon, pctOfDay };
    } else if (hour >= 7.5 && hour < 11.0) {
      return { label: 'Morning Sunrise Ramp', desc: 'Gentle sunrise ramp activating coral photosystems', icon: Sun, pctOfDay };
    } else if (hour >= 11.0 && hour < 16.0) {
      return { label: 'Solar Noon (Peak PAR)', desc: 'Full photoperiod driving zooxanthellae photosynthesis', icon: Sun, pctOfDay };
    } else if (hour >= 16.0 && hour < 20.5) {
      return { label: 'Golden Hour & Sunset', desc: 'Warm dusk transition reducing PAR levels', icon: Sun, pctOfDay };
    } else if (hour >= 20.5 && hour < 22.5) {
      return { label: 'Fluorescent Actinic Pop', desc: 'High UV/Blue spectrum exciting fluorescent proteins (GFP/RFP)', icon: Moon, pctOfDay };
    } else {
      return { label: 'Night Moon Phase', desc: 'Subtle moonlight simulation', icon: Moon, pctOfDay };
    }
  }, [deviceState.time]);

  const PhaseIcon = photoperiodPhase.icon;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* 24h Solar Photoperiod Arch (OLED View 0/1 Hardware Equivalent) */}
      <div className="card-elevated" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--channel-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PhaseIcon size={18} strokeWidth={2.2} />
            </div>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                24H Solar Photoperiod
              </span>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {photoperiodPhase.label}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Average PAR</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--channel-white)' }}>
              {totalIntensity}%
            </div>
          </div>
        </div>

        {/* Photoperiod Arc Visualization */}
        <div style={{ position: 'relative', width: '100%', height: '90px', margin: '0.5rem 0' }}>
          <svg width="100%" height="100%" viewBox="0 0 300 80" preserveAspectRatio="none">
            <defs>
              <linearGradient id="solarArchGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(56, 189, 248, 0.4)" />
                <stop offset="100%" stopColor="rgba(56, 189, 248, 0.0)" />
              </linearGradient>
            </defs>

            {/* Base timeline axis */}
            <line x1="0" y1="75" x2="300" y2="75" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />

            {/* Solar Daylight Bell Curve */}
            <path
              d="M 0 75 Q 75 75 100 50 Q 150 5 200 50 Q 225 75 300 75 Z"
              fill="url(#solarArchGrad)"
            />
            <path
              d="M 0 75 Q 75 75 100 50 Q 150 5 200 50 Q 225 75 300 75"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
            />

            {/* Live Sun Marker */}
            {(() => {
              const x = (photoperiodPhase.pctOfDay / 100) * 300;
              // Approximate y along the arch
              const rel = (x - 150) / 150;
              const y = 5 + Math.pow(rel, 2) * 70;
              return (
                <g>
                  <circle cx={x} cy={y} r="6" fill="#ffffff" filter="drop-shadow(0 0 6px #38bdf8)" />
                  <circle cx={x} cy={y} r="3" fill="#38bdf8" />
                  <line x1={x} y1={y + 6} x2={x} y2="75" stroke="#ffffff" strokeWidth="1" strokeDasharray="2 2" />
                </g>
              );
            })()}
          </svg>
        </div>

        {/* Photoperiod time markers */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>00:00 (Night)</span>
          <span>08:00 (Sunrise)</span>
          <span>13:00 (Peak)</span>
          <span>19:00 (Sunset)</span>
          <span>24:00</span>
        </div>
      </div>

      {/* Real-time Hardware Telemetry Bento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {/* Thermal Dissipation & Fan Card */}
        <div className="card-elevated" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <Fan size={16} color="var(--channel-fan)" />
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Thermal Dissipation
            </span>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
            {Math.round(live.fan)}%
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {live.fan > 0 ? 'Active Airflow' : 'Passive Silent Mode'}
          </div>
        </div>

        {/* Photobiology Spectrum Ratio */}
        <div className="card-elevated" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <Zap size={16} color="var(--channel-uv)" />
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Actinic / Daylight Ratio
            </span>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
            {live.white > 0 ? ((live.blue + live.uv) / (live.white * 2)).toFixed(1) : 'Pure'}x
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Blue-to-White Balance
          </div>
        </div>
      </div>

      {/* Firmware & Hardware System Specification Table */}
      <div className="card-elevated" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1rem' }}>
          <Cpu size={16} color="var(--channel-white)" />
          <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            System Architecture & Telemetry
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Firmware Version</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>
              v{deviceState.firmwareVersion || '1.2.5'} (LEDC PWM)
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>MCU Processor</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              ESP32 Dual-Core LX6 @ 240MHz
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Hardware RTC</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              DS3231 I2C Battery-Backed
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Display Backlight</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              LEDC Channel 5 PWM (5 kHz)
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Cloud Broker</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isBrokerConnected ? '#10b981' : '#f43f5e' }}>
              {isBrokerConnected ? 'HiveMQ Cloud TLS (WSS Connected)' : 'Broker Disconnected'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Flash Storage Wear Protection</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              NVS 3-Sec Debounced Writes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
