'use client';

import React, { useState, useEffect } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { Sparkles, Play, XCircle, CheckCircle2, Info } from 'lucide-react';
import { Schedule } from '../../lib/types';

const defaultSchedules: Schedule[] = [
  {
    id: 'natural_reef',
    name: 'Natural Reef Daylight',
    keyframes: [
      { time: '00:00', blue: 0, white: 0, uv: 0 },
      { time: '07:30', blue: 0, white: 0, uv: 0 },
      { time: '09:00', blue: 35, white: 10, uv: 15 },
      { time: '12:00', blue: 80, white: 50, uv: 65 },
      { time: '15:00', blue: 85, white: 55, uv: 70 },
      { time: '18:00', blue: 70, white: 25, uv: 50 },
      { time: '20:30', blue: 40, white: 0, uv: 30 },
      { time: '22:00', blue: 5, white: 0, uv: 0 },
      { time: '23:00', blue: 0, white: 0, uv: 0 },
    ],
  },
  {
    id: 'deep_coral_pop',
    name: 'High Fluorescent Actinic Pop',
    keyframes: [
      { time: '00:00', blue: 0, white: 0, uv: 0 },
      { time: '09:00', blue: 0, white: 0, uv: 0 },
      { time: '11:00', blue: 70, white: 5, uv: 80 },
      { time: '15:00', blue: 95, white: 15, uv: 100 },
      { time: '19:00', blue: 85, white: 5, uv: 90 },
      { time: '22:00', blue: 10, white: 0, uv: 0 },
      { time: '23:00', blue: 0, white: 0, uv: 0 },
    ],
  },
];

export default function AcclimationPage() {
  const { deviceState, publishAcclimation } = useDeviceMqtt();

  const [availableSchedules, setAvailableSchedules] = useState<Schedule[]>(defaultSchedules);
  const [targetSchedule, setTargetSchedule] = useState<string>('natural_reef');
  const [startPct, setStartPct] = useState<number>(50);
  const [daysTotal, setDaysTotal] = useState<number>(3);

  const activeAcc = deviceState.acclimation;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSchedules = localStorage.getItem('reef_schedules');
      if (savedSchedules) {
        try {
          const parsed = JSON.parse(savedSchedules);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAvailableSchedules(parsed);
            if (deviceState.activeScheduleId) {
              setTargetSchedule(deviceState.activeScheduleId);
            } else {
              setTargetSchedule(parsed[0].id);
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }, [deviceState.activeScheduleId]);

  const handleStart = () => {
    publishAcclimation({
      action: 'start',
      scheduleId: targetSchedule,
      startPct,
      days: Math.max(1, Math.min(90, daysTotal)),
    });
  };

  const handleCancel = () => {
    publishAcclimation({ action: 'cancel' });
  };

  let elapsedDays = 0;
  let currentMultiplier = 100;
  if (activeAcc?.active && activeAcc.startedAt) {
    const start = new Date(activeAcc.startedAt).getTime();
    const now = Date.now();
    elapsedDays = Math.max(0, Math.floor((now - start) / (1000 * 86400)));
    const progress = Math.min(Math.max(elapsedDays / activeAcc.daysTotal, 0), 1);
    currentMultiplier = Math.round(activeAcc.startPct + (100 - activeAcc.startPct) * progress);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Card */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Coral Acclimation Protocol
        </h2>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          Gradual intensity scaling to protect new coral introductions from photo-shock and bleaching
        </p>
      </div>

      {activeAcc?.active ? (
        /* Active Acclimation Status Tile */
        <div
          className="card-surface"
          style={{
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem',
            background: 'linear-gradient(145deg, rgba(48, 30, 68, 0.6) 0%, rgba(22, 22, 28, 0.9) 100%)',
            borderColor: 'rgba(168, 85, 247, 0.35)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'rgba(168, 85, 247, 0.18)',
                  color: '#c084fc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  boxShadow: '0 0 16px -2px rgba(168, 85, 247, 0.4)',
                }}
              >
                <Sparkles size={20} strokeWidth={2.2} />
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Ramp Active</h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Profile: <strong style={{ color: 'var(--text-secondary)' }}>{activeAcc.scheduleId}</strong>
                </span>
              </div>
            </div>

            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#c084fc',
                background: 'rgba(168, 85, 247, 0.18)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                padding: '0.22rem 0.65rem',
                borderRadius: 'var(--radius-full)',
              }}
            >
              DAY {elapsedDays + 1} OF {activeAcc.daysTotal}
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600 }}>Active Multiplier:</span>
              <strong style={{ color: '#c084fc', fontSize: '1.35rem', fontVariantNumeric: 'tabular-nums' }}>
                {currentMultiplier}%
              </strong>
            </div>
            <div className="channel-meter-track" style={{ height: '8px' }}>
              <div
                className="channel-meter-fill"
                style={{
                  width: `${((currentMultiplier - activeAcc.startPct) / (100 - activeAcc.startPct)) * 100}%`,
                  backgroundColor: '#a855f7',
                  color: '#a855f7',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              <span>Starts at {activeAcc.startPct}%</span>
              <span>Reaches 100% on Day {activeAcc.daysTotal}</span>
            </div>
          </div>

          <button
            onClick={handleCancel}
            className="btn-secondary"
            id="cancel-acclimation-btn"
            style={{
              marginTop: '0.35rem',
              color: '#f43f5e',
              background: 'rgba(244, 63, 94, 0.1)',
              borderColor: 'rgba(244, 63, 94, 0.25)',
              fontWeight: 700,
            }}
          >
            <XCircle size={15} /> End Acclimation (Restore 100% Full Schedule)
          </button>
        </div>
      ) : (
        /* Configuration Form */
        <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
            <CheckCircle2 size={16} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>100% Autonomous Schedule Active</span>
          </div>

          {/* Schedule Picker */}
          <div>
            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              Schedule Profile to Scale
            </label>
            <select
              value={targetSchedule}
              onChange={(e) => setTargetSchedule(e.target.value)}
              style={{ width: '100%' }}
            >
              {availableSchedules.map((s) => (
                <option key={s.id} value={s.id} style={{ background: '#121215', color: '#ffffff' }}>
                  {s.name} ({s.keyframes.length} points)
                </option>
              ))}
            </select>
          </div>

          {/* Starting Percentage Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Starting Intensity Scale
              </span>
              <span
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.12)',
                  padding: '0.15rem 0.55rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                }}
              >
                {startPct}%
              </span>
            </div>

            <input
              type="range"
              min="10"
              max="90"
              step="5"
              value={startPct}
              onChange={(e) => setStartPct(Number(e.target.value))}
              className="apple-range-input"
              style={{
                background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${startPct}%, rgba(255, 255, 255, 0.08) ${startPct}%, rgba(255, 255, 255, 0.08) 100%)`,
              }}
            />

            <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem' }}>
              {[30, 40, 50, 60, 70, 80].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setStartPct(pct)}
                  className={`btn-pill ${startPct === pct ? 'active' : ''}`}
                  style={{ flex: 1, fontSize: '0.7rem', padding: '0.3rem 0' }}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Custom Duration: 1 to 60 Days */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Ramp Duration
              </span>
              <span
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#c084fc',
                  background: 'rgba(168, 85, 247, 0.14)',
                  padding: '0.15rem 0.55rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                }}
              >
                {daysTotal} {daysTotal === 1 ? 'Day' : 'Days'}
              </span>
            </div>

            <input
              type="range"
              min="1"
              max="60"
              step="1"
              value={daysTotal}
              onChange={(e) => setDaysTotal(Number(e.target.value))}
              className="apple-range-input"
              style={{
                background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${(daysTotal / 60) * 100}%, rgba(255, 255, 255, 0.08) ${(daysTotal / 60) * 100}%, rgba(255, 255, 255, 0.08) 100%)`,
              }}
            />

            {/* Quick Preset Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.35rem', marginTop: '0.5rem' }}>
              {[1, 2, 3, 5, 7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysTotal(d)}
                  className={`btn-pill ${daysTotal === d ? 'active' : ''}`}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.35rem 0',
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Coral Guidance Box */}
            <div
              style={{
                marginTop: '0.85rem',
                padding: '0.75rem 0.95rem',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.73rem',
                color: 'var(--text-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Info size={13} color="#38bdf8" /> Recommendations:
              </div>
              <div>• <strong>1–3 Days:</strong> Hardy Softies & LPS (Zoas, Hammers, Torches).</div>
              <div>• <strong>5–7 Days:</strong> Standard mixed reef frag additions.</div>
              <div>• <strong>14+ Days:</strong> Sensitive SPS corals (Acropora, Montipora).</div>
            </div>
          </div>

          <button
            onClick={handleStart}
            className="btn-primary"
            id="start-acclimation-btn"
            style={{ marginTop: '0.2rem' }}
          >
            <Play size={16} /> Start Acclimation ({startPct}% → 100% over {daysTotal} {daysTotal === 1 ? 'Day' : 'Days'})
          </button>
        </div>
      )}
    </div>
  );
}
