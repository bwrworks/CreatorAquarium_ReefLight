'use client';

import React, { useState, useEffect } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { Sparkles, Play, XCircle, CheckCircle2, Info, Calendar, Sliders } from 'lucide-react';
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
  const [daysTotal, setDaysTotal] = useState<number>(3); // Quick, safe default: 3 days

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
      <div className="card-surface" style={{ padding: '1.15rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.02em' }}>
          Coral Acclimation Program
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
          Gradual intensity scaling protocol to protect newly introduced corals from light shock and bleaching
        </p>
      </div>

      {activeAcc?.active ? (
        /* Active Acclimation Status */
        <div
          className="card-surface"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            borderLeft: '4px solid var(--channel-uv)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--channel-uv-bg)', color: 'var(--channel-uv)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#09090b' }}>Acclimation Ramp Active</h3>
                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  Target Schedule: <strong>{activeAcc.scheduleId}</strong>
                </span>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--channel-uv)',
                background: 'var(--channel-uv-bg)',
                border: '1px solid var(--channel-uv-border)',
                padding: '0.2rem 0.55rem',
                borderRadius: '6px',
              }}
            >
              DAY {elapsedDays + 1} OF {activeAcc.daysTotal}
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '0.4rem' }}>
              <span style={{ color: '#475569', fontWeight: 600 }}>Current Scaling Multiplier:</span>
              <strong style={{ color: 'var(--channel-uv)', fontSize: '1.15rem' }}>{currentMultiplier}%</strong>
            </div>
            <div className="channel-meter-track" style={{ height: '10px' }}>
              <div
                className="channel-meter-fill"
                style={{
                  width: `${((currentMultiplier - activeAcc.startPct) / (100 - activeAcc.startPct)) * 100}%`,
                  backgroundColor: 'var(--channel-uv)',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.35rem' }}>
              <span>Starts at {activeAcc.startPct}%</span>
              <span>Reaches 100% on Day {activeAcc.daysTotal}</span>
            </div>
          </div>

          <button
            onClick={handleCancel}
            className="btn-danger"
            id="cancel-acclimation-btn"
            style={{ marginTop: '0.25rem' }}
          >
            <XCircle size={15} /> Cancel Acclimation (Restore 100% Full Schedule)
          </button>
        </div>
      ) : (
        /* Configuration Form */
        <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#059669' }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>Full 100% Lighting Active</span>
          </div>

          {/* Schedule Picker */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090b', display: 'block', marginBottom: '0.4rem' }}>
              Select Schedule Profile to Scale
            </label>
            <select
              value={targetSchedule}
              onChange={(e) => setTargetSchedule(e.target.value)}
              style={{
                width: '100%',
                background: '#ffffff',
                color: '#09090b',
                border: '1px solid #cbd5e1',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {availableSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.keyframes.length} keyframes)
                </option>
              ))}
            </select>
            <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
              The 24h curve of this schedule will be smoothly scaled from your starting percentage up to 100%.
            </span>
          </div>

          {/* Starting Percentage Slider + Number Input */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090b' }}>
                Starting Intensity Scale
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="number"
                  min="10"
                  max="95"
                  value={startPct}
                  onChange={(e) => setStartPct(Math.max(10, Math.min(95, Number(e.target.value))))}
                  style={{
                    width: '60px',
                    padding: '0.2rem 0.4rem',
                    textAlign: 'center',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    color: 'var(--channel-blue)',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    background: '#ffffff',
                  }}
                />
                <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--channel-blue)' }}>%</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              step="5"
              value={startPct}
              onChange={(e) => setStartPct(Number(e.target.value))}
              className="range-slider"
            />
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
              {[30, 40, 50, 60, 70, 80].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setStartPct(pct)}
                  className={`btn-secondary ${startPct === pct ? 'active' : ''}`}
                  style={{ flex: 1, fontSize: '0.72rem', padding: '0.3rem' }}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Custom Duration: 1 to 60 Days with direct custom number input and quick badges */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090b' }}>
                  Ramp Duration (Custom Days)
                </span>
                <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                  Pick a preset or type any custom number of days
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={daysTotal}
                  onChange={(e) => setDaysTotal(Math.max(1, Math.min(90, Number(e.target.value))))}
                  style={{
                    width: '60px',
                    padding: '0.2rem 0.4rem',
                    textAlign: 'center',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    color: 'var(--channel-blue)',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    background: '#ffffff',
                  }}
                />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>Days</span>
              </div>
            </div>

            {/* Continuous Slider from 1 to 60 Days */}
            <input
              type="range"
              min="1"
              max="60"
              step="1"
              value={daysTotal}
              onChange={(e) => setDaysTotal(Number(e.target.value))}
              className="range-slider"
            />

            {/* Quick Preset Buttons (1d to 30d) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.35rem', marginTop: '0.5rem' }}>
              {[1, 2, 3, 5, 7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysTotal(d)}
                  className={`btn-secondary ${daysTotal === d ? 'active' : ''}`}
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.35rem 0.2rem',
                    fontWeight: daysTotal === d ? 800 : 600,
                  }}
                >
                  {d} {d === 1 ? 'Day' : 'Days'}
                </button>
              ))}
            </div>

            {/* Practical Coral Guidance Pill */}
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.65rem 0.85rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.73rem',
                color: '#475569',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <div style={{ fontWeight: 700, color: '#09090b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Info size={13} color="#0284c7" /> Recommended Guidelines:
              </div>
              <div>• <strong>1 – 3 Days:</strong> Quick ramp for hardy Soft corals & LPS (Zoas, Mushrooms, Hammers, Torches).</div>
              <div>• <strong>5 – 7 Days:</strong> Standard addition for sensitive LPS & mixed reef frags.</div>
              <div>• <strong>14+ Days:</strong> Dedicated SPS corals (Acropora, Montipora) or full fixture upgrade.</div>
            </div>
          </div>

          <button
            onClick={handleStart}
            className="btn-primary"
            id="start-acclimation-btn"
            style={{ marginTop: '0.25rem', padding: '0.75rem', fontSize: '0.85rem' }}
          >
            <Play size={16} /> Start Acclimation ({startPct}% → 100% over {daysTotal} {daysTotal === 1 ? 'Day' : 'Days'})
          </button>
        </div>
      )}
    </div>
  );
}
