'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { Schedule, Keyframe, Channels, WeeklyAssignment } from '../../lib/types';
import { SpectrumVisualizer } from '../../components/SpectrumVisualizer';
import {
  Calendar,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Save,
  Check,
  Play,
  XCircle,
  CheckCircle2,
  Clock,
  Info,
  Sliders,
} from 'lucide-react';

const DEFAULT_SCHEDULES: Schedule[] = [
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

const DEFAULT_WEEKLY: WeeklyAssignment = {
  mon: 'natural_reef',
  tue: 'natural_reef',
  wed: 'natural_reef',
  thu: 'natural_reef',
  fri: 'natural_reef',
  sat: 'natural_reef',
  sun: 'natural_reef',
};

const DAYS: { key: keyof WeeklyAssignment; label: string; full: string }[] = [
  { key: 'mon', label: 'MON', full: 'Monday' },
  { key: 'tue', label: 'TUE', full: 'Tuesday' },
  { key: 'wed', label: 'WED', full: 'Wednesday' },
  { key: 'thu', label: 'THU', full: 'Thursday' },
  { key: 'fri', label: 'FRI', full: 'Friday' },
  { key: 'sat', label: 'SAT', full: 'Saturday' },
  { key: 'sun', label: 'SUN', full: 'Sunday' },
];

function timeToSec(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}

function secToTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export default function UnifiedSchedulePage() {
  const { deviceState, publishSchedule, publishWeekly, publishAcclimation } = useDeviceMqtt();

  // Internal Navigation Tabs
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'acclimation'>('daily');

  // Shared Schedules state
  const [schedules, setSchedules] = useState<Schedule[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reef_schedules');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return DEFAULT_SCHEDULES;
  });

  // Daily Curve Tab state
  const [activeScheduleId, setActiveScheduleId] = useState<string>('natural_reef');
  const [scrubberSec, setScrubberSec] = useState<number>(12 * 3600);
  const [dailySavedSuccess, setDailySavedSuccess] = useState<boolean>(false);
  const [showAddKf, setShowAddKf] = useState<boolean>(false);
  const [newKfTime, setNewKfTime] = useState<string>('14:00');
  const [newKfBlue, setNewKfBlue] = useState<number>(70);
  const [newKfWhite, setNewKfWhite] = useState<number>(30);
  const [newKfUv, setNewKfUv] = useState<number>(50);

  // Weekly Plan Tab state
  const [weekly, setWeekly] = useState<WeeklyAssignment>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reef_weekly');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return DEFAULT_WEEKLY;
  });
  const [weeklySavedSuccess, setWeeklySavedSuccess] = useState<boolean>(false);

  // Acclimation Tab state
  const [accTargetSchedule, setAccTargetSchedule] = useState<string>('natural_reef');
  const [accStartPct, setAccStartPct] = useState<number>(50);
  const [accDaysTotal, setAccDaysTotal] = useState<number>(14);

  // Persist schedules locally
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_schedules', JSON.stringify(schedules));
    }
  }, [schedules]);

  const activeSchedule = useMemo(() => {
    return schedules.find((s) => s.id === activeScheduleId) || schedules[0];
  }, [schedules, activeScheduleId]);

  // Interpolate channel values at scrubber position
  const scrubberValues = useMemo((): Channels => {
    const kfs = activeSchedule.keyframes;
    if (!kfs || kfs.length === 0) return { blue: 0, white: 0, uv: 0 };

    const sorted = [...kfs].sort((a, b) => timeToSec(a.time) - timeToSec(b.time));
    const firstSec = timeToSec(sorted[0].time);
    const lastSec = timeToSec(sorted[sorted.length - 1].time);

    if (scrubberSec <= firstSec) {
      return { blue: sorted[0].blue, white: sorted[0].white, uv: sorted[0].uv };
    }
    if (scrubberSec >= lastSec) {
      const last = sorted[sorted.length - 1];
      return { blue: last.blue, white: last.white, uv: last.uv };
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const t1 = timeToSec(sorted[i].time);
      const t2 = timeToSec(sorted[i + 1].time);
      if (scrubberSec >= t1 && scrubberSec <= t2) {
        const factor = t2 === t1 ? 0 : (scrubberSec - t1) / (t2 - t1);
        return {
          blue: Math.round(sorted[i].blue + (sorted[i + 1].blue - sorted[i].blue) * factor),
          white: Math.round(sorted[i].white + (sorted[i + 1].white - sorted[i].white) * factor),
          uv: Math.round(sorted[i].uv + (sorted[i + 1].uv - sorted[i].uv) * factor),
        };
      }
    }
    return { blue: 0, white: 0, uv: 0 };
  }, [activeSchedule, scrubberSec]);

  // Handlers for Daily Curve
  const handleSaveDaily = () => {
    publishSchedule(activeSchedule);
    setDailySavedSuccess(true);
    setTimeout(() => setDailySavedSuccess(false), 2500);
  };

  const handleAddKeyframe = () => {
    const updatedKfs = [
      ...activeSchedule.keyframes,
      { time: newKfTime, blue: newKfBlue, white: newKfWhite, uv: newKfUv },
    ].sort((a, b) => timeToSec(a.time) - timeToSec(b.time));

    const updatedSchedule = { ...activeSchedule, keyframes: updatedKfs };
    setSchedules((prev) => prev.map((s) => (s.id === activeSchedule.id ? updatedSchedule : s)));
    setShowAddKf(false);
  };

  const handleDeleteKeyframe = (timeStr: string) => {
    if (activeSchedule.keyframes.length <= 2) {
      alert('A daylight schedule must contain at least 2 keyframes.');
      return;
    }
    const updatedKfs = activeSchedule.keyframes.filter((k) => k.time !== timeStr);
    const updatedSchedule = { ...activeSchedule, keyframes: updatedKfs };
    setSchedules((prev) => prev.map((s) => (s.id === activeSchedule.id ? updatedSchedule : s)));
  };

  // Handlers for Weekly Plan
  const handleDayChange = (day: keyof WeeklyAssignment, scheduleId: string) => {
    setWeekly((prev) => ({ ...prev, [day]: scheduleId }));
  };

  const handleSaveWeekly = () => {
    publishWeekly(weekly);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_weekly', JSON.stringify(weekly));
    }
    setWeeklySavedSuccess(true);
    setTimeout(() => setWeeklySavedSuccess(false), 2500);
  };

  const applyPresetAllDays = (scheduleId: string) => {
    setWeekly({
      mon: scheduleId,
      tue: scheduleId,
      wed: scheduleId,
      thu: scheduleId,
      fri: scheduleId,
      sat: scheduleId,
      sun: scheduleId,
    });
  };

  // Handlers for Acclimation
  const activeAcc = deviceState.acclimation;
  const handleStartAcclimation = () => {
    publishAcclimation({
      action: 'start',
      scheduleId: accTargetSchedule,
      startPct: accStartPct,
      days: accDaysTotal,
    });
  };

  const handleCancelAcclimation = () => {
    publishAcclimation({ action: 'cancel' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* Segmented Top Navigation Control */}
      <div className="segmented-control" style={{ padding: '4px', background: 'rgba(255, 255, 255, 0.05)' }}>
        <button
          onClick={() => setActiveTab('daily')}
          className={activeTab === 'daily' ? 'active' : ''}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 700 }}
        >
          <Layers size={14} />
          <span>Daily Curve</span>
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          className={activeTab === 'weekly' ? 'active' : ''}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 700 }}
        >
          <Calendar size={14} />
          <span>Weekly Plan</span>
        </button>
        <button
          onClick={() => setActiveTab('acclimation')}
          className={activeTab === 'acclimation' ? 'active' : ''}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 700 }}
        >
          <Sparkles size={14} />
          <span>Acclimation</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAILY CURVE                                                        */}
      {/* ========================================================================= */}
      {activeTab === 'daily' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Active Schedule Selection & Actions */}
          <div className="card-elevated" style={{ padding: '1.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Active Daylight Program
                </span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {activeSchedule.name}
                </div>
              </div>

              <button
                onClick={handleSaveDaily}
                className="btn-primary"
                style={{
                  width: 'auto',
                  padding: '0.5rem 1rem',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: dailySavedSuccess ? '#10b981' : '#ffffff',
                  color: '#000000',
                }}
              >
                {dailySavedSuccess ? <Check size={14} /> : <Save size={14} />}
                <span>{dailySavedSuccess ? 'Pushed to ESP32' : 'Save to Device'}</span>
              </button>
            </div>

            {/* Schedule Switcher Pills */}
            <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
              {schedules.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveScheduleId(s.id)}
                  className={`btn-pill ${s.id === activeScheduleId ? 'active' : ''}`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Daylight Photoperiod 24h Graph */}
          <div className="card-elevated" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                24-Hour Intensity Photoperiod
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                <Clock size={13} color="var(--channel-white)" />
                <span>{secToTime(scrubberSec)}</span>
              </div>
            </div>

            {/* SVG Curve Visualization */}
            <div style={{ width: '100%', height: '140px', position: 'relative', overflow: 'hidden' }}>
              <svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="curveBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(59, 130, 246, 0.4)" />
                    <stop offset="100%" stopColor="rgba(59, 130, 246, 0.0)" />
                  </linearGradient>
                  <linearGradient id="curveWhite" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(56, 189, 248, 0.35)" />
                    <stop offset="100%" stopColor="rgba(56, 189, 248, 0.0)" />
                  </linearGradient>
                  <linearGradient id="curveUv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(168, 85, 247, 0.35)" />
                    <stop offset="100%" stopColor="rgba(168, 85, 247, 0.0)" />
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                <line x1="0" y1="30" x2="400" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                {/* Draw Curves for Blue, White, UV */}
                {['blue', 'white', 'uv'].map((chKey) => {
                  const sorted = [...activeSchedule.keyframes].sort((a, b) => timeToSec(a.time) - timeToSec(b.time));
                  const strokeCol = chKey === 'blue' ? '#3b82f6' : chKey === 'white' ? '#38bdf8' : '#a855f7';
                  const fillGrad = chKey === 'blue' ? 'url(#curveBlue)' : chKey === 'white' ? 'url(#curveWhite)' : 'url(#curveUv)';

                  let d = '';
                  sorted.forEach((kf, idx) => {
                    const sec = timeToSec(kf.time);
                    const x = (sec / 86400) * 400;
                    const val = kf[chKey as keyof Channels];
                    const y = 110 - (val / 100) * 100;
                    d += (idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
                  });

                  return (
                    <g key={chKey}>
                      <path d={`${d} L 400 120 L 0 120 Z`} fill={fillGrad} />
                      <path d={d} fill="none" stroke={strokeCol} strokeWidth="2.2" strokeLinecap="round" />
                    </g>
                  );
                })}

                {/* Scrubber vertical needle */}
                <line
                  x1={(scrubberSec / 86400) * 400}
                  y1="0"
                  x2={(scrubberSec / 86400) * 400}
                  y2="120"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
              </svg>
            </div>

            {/* Scrubber Input Range */}
            <input
              type="range"
              min="0"
              max="86400"
              step="300"
              value={scrubberSec}
              onChange={(e) => setScrubberSec(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--channel-white)', margin: '0.75rem 0' }}
            />

            {/* Readout at Scrubber Position */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
              <div style={{ padding: '0.45rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--channel-blue)', fontWeight: 700 }}>BLUE</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>{scrubberValues.blue}%</div>
              </div>
              <div style={{ padding: '0.45rem', background: 'rgba(56, 189, 248, 0.08)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--channel-white)', fontWeight: 700 }}>WHITE</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>{scrubberValues.white}%</div>
              </div>
              <div style={{ padding: '0.45rem', background: 'rgba(168, 85, 247, 0.08)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--channel-uv)', fontWeight: 700 }}>UV</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>{scrubberValues.uv}%</div>
              </div>
            </div>
          </div>

          {/* Keyframe Timeline List */}
          <div className="card-elevated" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Keyframes ({activeSchedule.keyframes.length})
              </span>
              <button
                onClick={() => setShowAddKf(!showAddKf)}
                className="btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
              >
                <Plus size={13} />
                <span>Add Keyframe</span>
              </button>
            </div>

            {/* Add Keyframe Inline Form */}
            {showAddKf && (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  marginBottom: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                  New Daylight Keyframe
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem' }}>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Time</label>
                    <input
                      type="time"
                      value={newKfTime}
                      onChange={(e) => setNewKfTime(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem', fontSize: '0.76rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--channel-blue)' }}>Blue %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newKfBlue}
                      onChange={(e) => setNewKfBlue(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.45rem', fontSize: '0.76rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--channel-white)' }}>White %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newKfWhite}
                      onChange={(e) => setNewKfWhite(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.45rem', fontSize: '0.76rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--channel-uv)' }}>UV %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newKfUv}
                      onChange={(e) => setNewKfUv(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.45rem', fontSize: '0.76rem' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowAddKf(false)} className="btn-secondary" style={{ fontSize: '0.72rem' }}>
                    Cancel
                  </button>
                  <button onClick={handleAddKeyframe} className="btn-pill active" style={{ fontSize: '0.72rem' }}>
                    Save Point
                  </button>
                </div>
              </div>
            )}

            {/* List of keyframes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {activeSchedule.keyframes.map((kf) => (
                <div
                  key={kf.time}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#ffffff', minWidth: '45px' }}>
                      {kf.time}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.74rem' }}>
                      <span style={{ color: 'var(--channel-blue)' }}>B: {kf.blue}%</span>
                      <span style={{ color: 'var(--channel-white)' }}>W: {kf.white}%</span>
                      <span style={{ color: 'var(--channel-uv)' }}>UV: {kf.uv}%</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteKeyframe(kf.time)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '0.25rem',
                    }}
                    title="Delete Keyframe"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: WEEKLY PLAN                                                        */}
      {/* ========================================================================= */}
      {activeTab === 'weekly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div className="card-elevated" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  7-Day Calendar Rotation
                </span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Weekly Program
                </div>
              </div>

              <button
                onClick={handleSaveWeekly}
                className="btn-primary"
                style={{
                  width: 'auto',
                  padding: '0.5rem 1rem',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: weeklySavedSuccess ? '#10b981' : '#ffffff',
                  color: '#000000',
                }}
              >
                {weeklySavedSuccess ? <Check size={14} /> : <Save size={14} />}
                <span>{weeklySavedSuccess ? 'Pushed to ESP32' : 'Save Plan'}</span>
              </button>
            </div>

            {/* Quick Bulk Presets */}
            <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '1rem' }}>
              {schedules.map((s) => (
                <button
                  key={s.id}
                  onClick={() => applyPresetAllDays(s.id)}
                  className="btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem' }}
                >
                  Apply {s.name} to All Days
                </button>
              ))}
            </div>

            {/* 7 Days Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {DAYS.map((day) => {
                const currentSched = weekly[day.key];
                return (
                  <div
                    key={day.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {day.label}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          {day.full}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Active Program: {schedules.find((s) => s.id === currentSched)?.name || currentSched}
                        </div>
                      </div>
                    </div>

                    <select
                      value={currentSched}
                      onChange={(e) => handleDayChange(day.key, e.target.value)}
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
                    >
                      {schedules.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ACCLIMATION PROGRAM                                                */}
      {/* ========================================================================= */}
      {activeTab === 'acclimation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Active Acclimation Banner or Status */}
          {activeAcc && activeAcc.active ? (
            <div className="card-elevated" style={{ padding: '1.25rem', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#10b981' }}>
                      Acclimation In Progress
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Soft Photoperiod Ramping for New Corals
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCancelAcclimation}
                  className="btn-secondary"
                  style={{ color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)', padding: '0.45rem 0.85rem', fontSize: '0.74rem' }}
                >
                  <XCircle size={14} />
                  <span>Cancel Routine</span>
                </button>
              </div>

              {/* Acclimation Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.55rem', margin: '1rem 0' }}>
                <div style={{ padding: '0.65rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>STARTING PAR</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{activeAcc.startPct}%</div>
                </div>
                <div style={{ padding: '0.65rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TOTAL DAYS</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{activeAcc.daysTotal} Days</div>
                </div>
                <div style={{ padding: '0.65rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TARGET</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>100%</div>
                </div>
              </div>

              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                The schedule engine autonomously multiplies output keyframes by the linear acclimation ramp daily, protecting zooxanthellae from photo-shock.
              </div>
            </div>
          ) : (
            /* Setup New Acclimation Routine */
            <div className="card-elevated" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    color: 'var(--channel-uv)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    Start Coral Acclimation
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Gradually adapt newly introduced corals to full light PAR
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Target Daylight Schedule
                  </label>
                  <select
                    value={accTargetSchedule}
                    onChange={(e) => setAccTargetSchedule(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {schedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                      Starting PAR Intensity: {accStartPct}%
                    </label>
                    <input
                      type="range"
                      min="20"
                      max="80"
                      step="5"
                      value={accStartPct}
                      onChange={(e) => setAccStartPct(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--channel-uv)' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                      Ramp Duration: {accDaysTotal} Days
                    </label>
                    <input
                      type="range"
                      min="3"
                      max="30"
                      step="1"
                      value={accDaysTotal}
                      onChange={(e) => setAccDaysTotal(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--channel-uv)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  {[7, 14, 21].map((d) => (
                    <button
                      key={d}
                      onClick={() => setAccDaysTotal(d)}
                      className={`btn-pill ${accDaysTotal === d ? 'active' : ''}`}
                      style={{ flex: 1 }}
                    >
                      {d} Days
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleStartAcclimation}
                  className="btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                    background: 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)',
                    color: '#ffffff',
                    marginTop: '0.5rem',
                  }}
                >
                  <Play size={16} />
                  <span>Commence Coral Acclimation</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
