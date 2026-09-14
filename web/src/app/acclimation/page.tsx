'use client';

import React, { useState } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { Sparkles, Play, XCircle, CheckCircle2, Info } from 'lucide-react';

export default function AcclimationPage() {
  const { deviceState, publishAcclimation } = useDeviceMqtt();

  const [targetSchedule, setTargetSchedule] = useState<string>('natural_reef');
  const [startPct, setStartPct] = useState<number>(50);
  const [daysTotal, setDaysTotal] = useState<number>(14);

  const activeAcc = deviceState.acclimation;

  const handleStart = () => {
    publishAcclimation({
      action: 'start',
      scheduleId: targetSchedule,
      startPct,
      days: daysTotal,
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
        <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
          Linear ramp-up protocol to protect newly introduced corals from light shock and bleaching
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
                  Target: <strong>{activeAcc.scheduleId}</strong>
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
              DAY {elapsedDays} OF {activeAcc.daysTotal}
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '0.4rem' }}>
              <span style={{ color: '#475569', fontWeight: 600 }}>Calculated Scaling Multiplier:</span>
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
            <XCircle size={15} /> Cancel Acclimation
          </button>
        </div>
      ) : (
        /* Configuration Form */
        <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#059669' }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>Full 100% Lighting Active</span>
          </div>

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
              <option value="natural_reef">Natural Reef Daylight</option>
              <option value="deep_coral_pop">High Fluorescent Actinic Pop</option>
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090b' }}>
                Starting Intensity Scale
              </span>
              <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--channel-blue)' }}>{startPct}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="80"
              step="5"
              value={startPct}
              onChange={(e) => setStartPct(Number(e.target.value))}
              className="range-slider"
            />
            <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.3rem', display: 'block' }}>
              Recommended: 50% for standard SPS/LPS frag additions
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#09090b' }}>
                Ramp Duration
              </span>
              <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--channel-blue)' }}>{daysTotal} Days</span>
            </div>
            <input
              type="range"
              min="7"
              max="60"
              step="1"
              value={daysTotal}
              onChange={(e) => setDaysTotal(Number(e.target.value))}
              className="range-slider"
            />
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
              {[7, 14, 21, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysTotal(d)}
                  className={`btn-secondary ${daysTotal === d ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    fontSize: '0.74rem',
                    padding: '0.35rem',
                  }}
                >
                  {d} Days
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStart}
            className="btn-primary"
            id="start-acclimation-btn"
            style={{ marginTop: '0.35rem' }}
          >
            <Play size={15} /> Start Acclimation Protocol
          </button>
        </div>
      )}
    </div>
  );
}
