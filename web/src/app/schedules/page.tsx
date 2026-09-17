'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { Schedule, Keyframe, Channels } from '../../lib/types';
import { SpectrumVisualizer } from '../../components/SpectrumVisualizer';
import {
  Plus,
  Trash2,
  Copy,
  Save,
  Clock,
  Play,
  Check,
  Sparkles,
  Layers,
} from 'lucide-react';

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

function timeToSec(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 3600 + m * 60;
}

function secToTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export default function SchedulesPage() {
  const { publishSchedule, publishChannels, deviceState } = useDeviceMqtt();

  const [schedules, setSchedules] = useState<Schedule[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reef_schedules');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return defaultSchedules;
  });

  const [activeScheduleId, setActiveScheduleId] = useState<string>('natural_reef');
  const [scrubberSec, setScrubberSec] = useState<number>(12 * 3600);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [previewActive, setPreviewActive] = useState<boolean>(false);

  const [newKfTime, setNewKfTime] = useState<string>('14:00');
  const [newKfBlue, setNewKfBlue] = useState<number>(70);
  const [newKfWhite, setNewKfWhite] = useState<number>(30);
  const [newKfUv, setNewKfUv] = useState<number>(50);
  const [showAddKf, setShowAddKf] = useState<boolean>(false);

  const activeSchedule = useMemo(() => {
    return schedules.find((s) => s.id === activeScheduleId) || schedules[0];
  }, [schedules, activeScheduleId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_schedules', JSON.stringify(schedules));
    }
  }, [schedules]);

  const scrubberValues = useMemo((): Channels => {
    const kfs = activeSchedule.keyframes;
    if (kfs.length === 0) return { blue: 0, white: 0, uv: 0 };
    if (kfs.length === 1) return { ...kfs[0] };

    const withSec = kfs.map((k) => ({ ...k, sec: timeToSec(k.time) }));
    withSec.sort((a, b) => a.sec - b.sec);

    let idx1 = -1;
    let idx2 = -1;
    for (let i = 0; i < withSec.length; i++) {
      if (withSec[i].sec <= scrubberSec) idx1 = i;
      if (withSec[i].sec >= scrubberSec && idx2 === -1) idx2 = i;
    }

    if (idx1 === -1 || idx2 === -1 || idx1 === withSec.length - 1) {
      const k1 = withSec[withSec.length - 1];
      const k2 = withSec[0];
      const dt = 86400 - k1.sec + k2.sec;
      const el = scrubberSec >= k1.sec ? scrubberSec - k1.sec : 86400 - k1.sec + scrubberSec;
      const f = dt > 0 ? el / dt : 0;
      return {
        blue: Math.round(k1.blue + (k2.blue - k1.blue) * f),
        white: Math.round(k1.white + (k2.white - k1.white) * f),
        uv: Math.round(k1.uv + (k2.uv - k1.uv) * f),
      };
    }

    if (idx1 === idx2) return { ...withSec[idx1] };

    const k1 = withSec[idx1];
    const k2 = withSec[idx2];
    const dt = k2.sec - k1.sec;
    const el = scrubberSec - k1.sec;
    const f = dt > 0 ? el / dt : 0;

    return {
      blue: Math.round(k1.blue + (k2.blue - k1.blue) * f),
      white: Math.round(k1.white + (k2.white - k1.white) * f),
      uv: Math.round(k1.uv + (k2.uv - k1.uv) * f),
    };
  }, [activeSchedule, scrubberSec]);

  const curvePaths = useMemo(() => {
    const kfs = [...activeSchedule.keyframes].sort((a, b) => timeToSec(a.time) - timeToSec(b.time));
    if (kfs.length < 2) return { blue: '', white: '', uv: '' };

    const width = 1000;
    const height = 180;

    const toX = (sec: number) => (sec / 86400) * width;
    const toY = (val: number) => height - (val / 100) * (height - 24) - 12;

    const makePath = (ch: keyof Channels) => {
      let d = `M ${toX(timeToSec(kfs[0].time))} ${toY(kfs[0][ch])}`;
      for (let i = 1; i < kfs.length; i++) {
        d += ` L ${toX(timeToSec(kfs[i].time))} ${toY(kfs[i][ch])}`;
      }
      return d;
    };

    return {
      blue: makePath('blue'),
      white: makePath('white'),
      uv: makePath('uv'),
    };
  }, [activeSchedule]);

  const handleSaveToDevice = () => {
    publishSchedule(activeSchedule);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handlePreviewScrubberOnFixture = () => {
    publishChannels(scrubberValues);
    setPreviewActive(true);
    setTimeout(() => setPreviewActive(false), 3000);
  };

  const handleAddKeyframe = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedKeyframes = [
      ...activeSchedule.keyframes.filter((k) => k.time !== newKfTime),
      {
        time: newKfTime,
        blue: newKfBlue,
        white: newKfWhite,
        uv: newKfUv,
      },
    ].sort((a, b) => timeToSec(a.time) - timeToSec(b.time));

    const updatedSchedule = { ...activeSchedule, keyframes: updatedKeyframes };
    setSchedules((prev) => prev.map((s) => (s.id === activeSchedule.id ? updatedSchedule : s)));
    setShowAddKf(false);
  };

  const handleDeleteKeyframe = (timeStr: string) => {
    if (activeSchedule.keyframes.length <= 2) {
      alert('A schedule requires at least 2 keyframes.');
      return;
    }
    const updatedKeyframes = activeSchedule.keyframes.filter((k) => k.time !== timeStr);
    const updatedSchedule = { ...activeSchedule, keyframes: updatedKeyframes };
    setSchedules((prev) => prev.map((s) => (s.id === activeSchedule.id ? updatedSchedule : s)));
  };

  const handleDuplicateSchedule = () => {
    const newId = `${activeSchedule.id}_copy_${Math.floor(Math.random() * 1000)}`;
    const newSched: Schedule = {
      id: newId,
      name: `${activeSchedule.name} (Copy)`,
      keyframes: [...activeSchedule.keyframes],
    };
    setSchedules((prev) => [...prev, newSched]);
    setActiveScheduleId(newId);
  };

  const handleDeleteSchedule = () => {
    if (schedules.length <= 1) {
      alert('Cannot delete the last remaining schedule.');
      return;
    }
    if (confirm(`Delete schedule "${activeSchedule.name}"?`)) {
      publishSchedule({ action: 'delete', id: activeSchedule.id });
      const filtered = schedules.filter((s) => s.id !== activeSchedule.id);
      setSchedules(filtered);
      setActiveScheduleId(filtered[0].id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Schedule Selector Header */}
      <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Photoperiod Schedules
            </h2>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              24-hour linear keyframe interpolation
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={handleDuplicateSchedule}
              className="btn-secondary"
              title="Duplicate Schedule"
              style={{ padding: '0.45rem 0.65rem' }}
            >
              <Copy size={14} />
            </button>
            {schedules.length > 1 && (
              <button
                onClick={handleDeleteSchedule}
                className="btn-secondary"
                title="Delete Schedule"
                style={{ padding: '0.45rem 0.65rem', color: '#f43f5e' }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Profile Tabs */}
        <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
          {schedules.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveScheduleId(s.id)}
              className={`btn-pill ${s.id === activeScheduleId ? 'active' : ''}`}
              style={{
                fontSize: '0.76rem',
                whiteSpace: 'nowrap',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* 24-Hour Multi-Channel Curve Chart */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Clock size={16} color="#38bdf8" />
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>24-Hour Photoperiod</span>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', fontSize: '0.7rem', fontWeight: 700 }}>
            <span style={{ color: '#60a5fa' }}>Blue (10x)</span>
            <span style={{ color: '#38bdf8' }}>White (4x)</span>
            <span style={{ color: '#c084fc' }}>UV (2x)</span>
          </div>
        </div>

        {/* SVG Curve Canvas */}
        <div
          style={{
            width: '100%',
            height: '180px',
            background: '#050508',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <svg
            viewBox="0 0 1000 180"
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            {/* Hour Grid Lines */}
            {[3, 6, 9, 12, 15, 18, 21].map((hour) => (
              <line
                key={hour}
                x1={(hour / 24) * 1000}
                y1="0"
                x2={(hour / 24) * 1000}
                y2="180"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ))}

            {/* Curves */}
            <path
              d={curvePaths.blue}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              style={{ filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.6))' }}
            />
            <path
              d={curvePaths.white}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              strokeDasharray="4 3"
              style={{ filter: 'drop-shadow(0 0 5px rgba(56, 189, 248, 0.6))' }}
            />
            <path
              d={curvePaths.uv}
              fill="none"
              stroke="#a855f7"
              strokeWidth="2.5"
              style={{ filter: 'drop-shadow(0 0 6px rgba(168, 85, 247, 0.6))' }}
            />

            {/* Keyframe Nodes */}
            {activeSchedule.keyframes.map((kf, i) => {
              const x = (timeToSec(kf.time) / 86400) * 1000;
              const y = 180 - (kf.blue / 100) * 156 - 12;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="5"
                  fill="#3b82f6"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              );
            })}

            {/* Scrubber Line */}
            <line
              x1={(scrubberSec / 86400) * 1000}
              y1="0"
              x2={(scrubberSec / 86400) * 1000}
              y2="180"
              stroke="#ffffff"
              strokeWidth="2"
              strokeDasharray="2 2"
              style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.8))' }}
            />
          </svg>
        </div>

        {/* Scrubber Slider */}
        <div style={{ marginTop: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Timeline Position:</span>
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {secToTime(scrubberSec)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="86399"
            step="60"
            value={scrubberSec}
            onChange={(e) => setScrubberSec(Number(e.target.value))}
            className="apple-range-input"
            style={{ width: '100%' }}
          />
        </div>

        {/* Numeric Intensity Badges at Scrubber time */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            marginTop: '0.85rem',
          }}
        >
          <div style={{ textAlign: 'center', padding: '0.55rem', borderRadius: 'var(--radius-sm)', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#60a5fa' }}>BLUE (10x)</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{scrubberValues.blue}%</div>
          </div>
          <div style={{ textAlign: 'center', padding: '0.55rem', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#38bdf8' }}>WHITE (4x)</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{scrubberValues.white}%</div>
          </div>
          <div style={{ textAlign: 'center', padding: '0.55rem', borderRadius: 'var(--radius-sm)', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c084fc' }}>UV (2x)</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{scrubberValues.uv}%</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
          <button
            onClick={handlePreviewScrubberOnFixture}
            className="btn-secondary"
            id="preview-fixture-btn"
            style={{ flex: 1, fontSize: '0.78rem' }}
          >
            <Play size={13} color="#38bdf8" />
            {previewActive ? 'Emitting...' : 'Preview Point'}
          </button>

          <button
            onClick={handleSaveToDevice}
            className="btn-primary"
            id="save-schedule-btn"
            style={{ flex: 1, fontSize: '0.78rem' }}
          >
            {savedSuccess ? (
              <>
                <Check size={14} /> Synced to ESP32
              </>
            ) : (
              <>
                <Save size={14} /> Push to ESP32
              </>
            )}
          </button>
        </div>
      </div>

      {/* Real-time Resulting Spectrum at Scrubber Position */}
      <SpectrumVisualizer
        channels={scrubberValues}
        title={`Spectral Distribution at ${secToTime(scrubberSec)}`}
      />

      {/* Keyframe Table & Editor */}
      <div className="card-surface" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h3 style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Keyframes ({activeSchedule.keyframes.length})
          </h3>
          <button
            onClick={() => setShowAddKf(!showAddKf)}
            className="btn-pill"
            id="add-keyframe-btn"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.74rem' }}
          >
            <Plus size={13} /> Add Point
          </button>
        </div>

        {/* Inline Add Keyframe Form */}
        {showAddKf && (
          <form
            onSubmit={handleAddKeyframe}
            style={{
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Time of Day</span>
              <input
                type="time"
                value={newKfTime}
                onChange={(e) => setNewKfTime(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>Channel Values</span>
              <button
                type="button"
                onClick={() => {
                  setNewKfBlue(Math.round(deviceState.live.blue));
                  setNewKfWhite(Math.round(deviceState.live.white));
                  setNewKfUv(Math.round(deviceState.live.uv));
                }}
                className="btn-pill"
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.55rem',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                <Sparkles size={11} /> Use Live Light Mix
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#60a5fa' }}>Blue: {newKfBlue}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newKfBlue}
                  onChange={(e) => setNewKfBlue(Number(e.target.value))}
                  className="apple-range-input"
                  style={{ height: '22px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#38bdf8' }}>White: {newKfWhite}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newKfWhite}
                  onChange={(e) => setNewKfWhite(Number(e.target.value))}
                  className="apple-range-input"
                  style={{ height: '22px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#c084fc' }}>UV: {newKfUv}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newKfUv}
                  onChange={(e) => setNewKfUv(Number(e.target.value))}
                  className="apple-range-input"
                  style={{ height: '22px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1, padding: '0.55rem' }}>
                Insert Point
              </button>
              <button
                type="button"
                onClick={() => setShowAddKf(false)}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.55rem' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Keyframe Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {activeSchedule.keyframes.map((kf) => (
            <div
              key={kf.time}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.7rem 0.95rem',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', width: '48px', fontVariantNumeric: 'tabular-nums' }}>
                  {kf.time}
                </span>
                <div style={{ display: 'flex', gap: '0.65rem', fontSize: '0.75rem', fontWeight: 600 }}>
                  <span style={{ color: '#60a5fa' }}>B:{kf.blue}%</span>
                  <span style={{ color: '#38bdf8' }}>W:{kf.white}%</span>
                  <span style={{ color: '#c084fc' }}>UV:{kf.uv}%</span>
                </div>
              </div>

              {activeSchedule.keyframes.length > 2 && (
                <button
                  onClick={() => handleDeleteKeyframe(kf.time)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                  }}
                  title="Delete keyframe"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
