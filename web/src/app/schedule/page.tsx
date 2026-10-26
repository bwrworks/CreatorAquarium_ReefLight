'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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

const DEFAULT_KEYFRAMES: Keyframe[] = [
  { time: '00:00', blue: 0, white: 0, uv: 0 },
  { time: '12:00', blue: 0, white: 0, uv: 0 },
  { time: '13:00', blue: 50, white: 25, uv: 40 },
  { time: '20:00', blue: 50, white: 25, uv: 40 },
  { time: '21:00', blue: 0, white: 0, uv: 0 },
  { time: '23:59', blue: 0, white: 0, uv: 0 },
];

function buildPhotoperiodKeyframes(
  start: string,
  end: string,
  rampMin: number,
  blue: number,
  white: number,
  uv: number
): Keyframe[] {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = (sh || 0) * 60 + (sm || 0);
  let endMin = (eh || 0) * 60 + (em || 0);
  if (endMin <= startMin) endMin = startMin + 540; // 9 hours fallback

  let peakStartMin = startMin + rampMin;
  let peakEndMin = endMin - rampMin;
  if (peakEndMin < peakStartMin) {
    const quarter = Math.floor((endMin - startMin) / 4);
    peakStartMin = startMin + quarter;
    peakEndMin = endMin - quarter;
  }

  const fmt = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  return [
    { time: '00:00', blue: 0, white: 0, uv: 0 },
    { time: fmt(startMin), blue: 0, white: 0, uv: 0 },
    { time: fmt(peakStartMin), blue, white, uv },
    { time: fmt(peakEndMin), blue, white, uv },
    { time: fmt(endMin), blue: 0, white: 0, uv: 0 },
    { time: '23:59', blue: 0, white: 0, uv: 0 },
  ];
}

function calculatePhotoperiodHours(start: string, end: string): string {
  const [sh, sm] = (start || '12:00').split(':').map(Number);
  const [eh, em] = (end || '21:00').split(':').map(Number);
  let startMin = (sh || 0) * 60 + (sm || 0);
  let endMin = (eh || 0) * 60 + (em || 0);
  if (endMin <= startMin) endMin += 1440;
  return ((endMin - startMin) / 60).toFixed(1);
}

function extractPhotoperiod(kfs: Keyframe[]) {
  if (!kfs || kfs.length < 5) return null;
  const start = kfs[1]?.time || '12:00';
  const peakStart = kfs[2]?.time || '13:00';
  const end = kfs[kfs.length - 2]?.time || '21:00';
  const [sh, sm] = start.split(':').map(Number);
  const [psh, psm] = peakStart.split(':').map(Number);
  const rampMin = Math.max(15, (psh * 60 + psm) - (sh * 60 + sm)) || 60;
  const blue = kfs[2]?.blue ?? 50;
  const white = kfs[2]?.white ?? 25;
  const uv = kfs[2]?.uv ?? 40;
  return { start, end, rampMin, blue, white, uv };
}

const DEFAULT_SCHEDULES: Schedule[] = [
  {
    id: 'reef_growth',
    name: 'Reef Growth Daylight',
    keyframes: DEFAULT_KEYFRAMES,
  },
];

const DEFAULT_WEEKLY: WeeklyAssignment = {
  mon: 'reef_growth',
  tue: 'reef_growth',
  wed: 'reef_growth',
  thu: 'reef_growth',
  fri: 'reef_growth',
  sat: 'reef_growth',
  sun: 'reef_growth',
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
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasLegacy = parsed.some((s: Schedule) => s.id === 'reef_growth_w1' || s.id === 'natural_reef');
            if (!hasLegacy && parsed.find((s: Schedule) => s.id === 'reef_growth')) {
              const cleaned = parsed.map((s: Schedule) => {
                if (s.id === 'reef_growth' && s.name && (s.name.includes('9h') || s.name.includes('9.0h'))) {
                  const extracted = extractPhotoperiod(s.keyframes);
                  if (extracted) {
                    const dur = calculatePhotoperiodHours(extracted.start, extracted.end);
                    return { ...s, name: `Reef Growth (${dur}h: ${extracted.start}-${extracted.end})` };
                  }
                  return { ...s, name: 'Reef Growth Photoperiod' };
                }
                return s;
              });
              localStorage.setItem('reef_schedules', JSON.stringify(cleaned));
              return cleaned;
            }
          }
        } catch {}
      }
    }
    return DEFAULT_SCHEDULES;
  });

  // Daily Photoperiod Builder State initialized from localStorage or existing saved schedule
  const initialParams = useMemo(() => {
    if (typeof window !== 'undefined') {
      const savedParams = localStorage.getItem('reef_photoperiod');
      if (savedParams) {
        try {
          const parsed = JSON.parse(savedParams);
          if (parsed && parsed.start && parsed.end) return parsed;
        } catch {}
      }
      const savedScheds = localStorage.getItem('reef_schedules');
      if (savedScheds) {
        try {
          const parsed = JSON.parse(savedScheds);
          if (Array.isArray(parsed) && parsed[0]?.keyframes) {
            const extracted = extractPhotoperiod(parsed[0].keyframes);
            if (extracted) return extracted;
          }
        } catch {}
      }
    }
    return {
      start: '12:00',
      end: '21:00',
      rampMin: 60,
      blue: 50,
      uv: 40,
      white: 25,
    };
  }, []);

  const [photoStart, setPhotoStart] = useState<string>(() => initialParams.start);
  const [photoEnd, setPhotoEnd] = useState<string>(() => initialParams.end);
  const [photoRampMin, setPhotoRampMin] = useState<number>(() => initialParams.rampMin);
  const [photoBlue, setPhotoBlue] = useState<number>(() => initialParams.blue);
  const [photoUv, setPhotoUv] = useState<number>(() => initialParams.uv);
  const [photoWhite, setPhotoWhite] = useState<number>(() => initialParams.white);
  const [showRawKeyframes, setShowRawKeyframes] = useState<boolean>(false);

  // Dynamic sync when device publishes its live hardware schedule
  const hasSyncedHardwareRef = useRef<boolean>(false);
  useEffect(() => {
    if (
      deviceState.activeScheduleKeyframes &&
      deviceState.activeScheduleKeyframes.length >= 5 &&
      !hasSyncedHardwareRef.current
    ) {
      const extracted = extractPhotoperiod(deviceState.activeScheduleKeyframes);
      if (extracted) {
        hasSyncedHardwareRef.current = true;
        setPhotoStart(extracted.start);
        setPhotoEnd(extracted.end);
        setPhotoRampMin(extracted.rampMin);
        setPhotoBlue(extracted.blue);
        setPhotoWhite(extracted.white);
        setPhotoUv(extracted.uv);

        const dur = calculatePhotoperiodHours(extracted.start, extracted.end);
        const name = deviceState.activeScheduleName || `Reef Growth (${dur}h: ${extracted.start}-${extracted.end})`;
        const updated: Schedule = {
          id: deviceState.activeScheduleId || 'reef_growth',
          name,
          keyframes: deviceState.activeScheduleKeyframes,
        };
        setSchedules([updated]);
        if (typeof window !== 'undefined') {
          localStorage.setItem('reef_photoperiod', JSON.stringify(extracted));
          localStorage.setItem('reef_schedules', JSON.stringify([updated]));
        }
      }
    }
  }, [deviceState.activeScheduleKeyframes, deviceState.activeScheduleName, deviceState.activeScheduleId]);

  // Daily Curve Tab state
  const [activeScheduleId, setActiveScheduleId] = useState<string>('reef_growth');
  const [scrubberSec, setScrubberSec] = useState<number>(16 * 3600 + 30 * 60); // Default to 16:30 (midday daylight peak)
  const [dailySavedSuccess, setDailySavedSuccess] = useState<boolean>(false);
  const [showAddKf, setShowAddKf] = useState<boolean>(false);
  const [newKfTime, setNewKfTime] = useState<string>('16:00');
  const [newKfBlue, setNewKfBlue] = useState<number>(50);
  const [newKfWhite, setNewKfWhite] = useState<number>(25);
  const [newKfUv, setNewKfUv] = useState<number>(40);

  // Weekly Plan Tab state
  const [weekly, setWeekly] = useState<WeeklyAssignment>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reef_weekly');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            const cleanWeekly = { ...DEFAULT_WEEKLY };
            (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as (keyof WeeklyAssignment)[]).forEach((d) => {
              if (parsed[d] && parsed[d] !== 'natural_reef' && parsed[d] !== 'deep_coral_pop' && !parsed[d].startsWith('reef_growth_w')) {
                cleanWeekly[d] = parsed[d];
              }
            });
            localStorage.setItem('reef_weekly', JSON.stringify(cleanWeekly));
            return cleanWeekly;
          }
        } catch {}
      }
    }
    return DEFAULT_WEEKLY;
  });
  const [weeklySavedSuccess, setWeeklySavedSuccess] = useState<boolean>(false);

  // Acclimation Tab state
  const [accTargetSchedule, setAccTargetSchedule] = useState<string>('reef_growth');
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

  const handlePhotoperiodChange = (
    newStart = photoStart,
    newEnd = photoEnd,
    newRamp = photoRampMin,
    newB = photoBlue,
    newW = photoWhite,
    newU = photoUv
  ) => {
    setPhotoStart(newStart);
    setPhotoEnd(newEnd);
    setPhotoRampMin(newRamp);
    setPhotoBlue(newB);
    setPhotoWhite(newW);
    setPhotoUv(newU);

    const dur = calculatePhotoperiodHours(newStart, newEnd);
    const dynamicName = `Reef Growth (${dur}h: ${newStart}-${newEnd})`;

    const kfs = buildPhotoperiodKeyframes(newStart, newEnd, newRamp, newB, newW, newU);
    const updated: Schedule = {
      id: 'reef_growth',
      name: dynamicName,
      keyframes: kfs,
    };
    setSchedules([updated]);
  };

  const handleSavePhotoperiod = () => {
    const dur = calculatePhotoperiodHours(photoStart, photoEnd);
    const dynamicName = `Reef Growth (${dur}h: ${photoStart}-${photoEnd})`;

    const kfs = buildPhotoperiodKeyframes(photoStart, photoEnd, photoRampMin, photoBlue, photoWhite, photoUv);
    const updated: Schedule = {
      id: 'reef_growth',
      name: dynamicName,
      keyframes: kfs,
    };
    setSchedules([updated]);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_schedules', JSON.stringify([updated]));
      localStorage.setItem(
        'reef_photoperiod',
        JSON.stringify({
          start: photoStart,
          end: photoEnd,
          rampMin: photoRampMin,
          blue: photoBlue,
          white: photoWhite,
          uv: photoUv,
        })
      );
    }
    publishSchedule(updated);

    const allDays: WeeklyAssignment = {
      mon: 'reef_growth',
      tue: 'reef_growth',
      wed: 'reef_growth',
      thu: 'reef_growth',
      fri: 'reef_growth',
      sat: 'reef_growth',
      sun: 'reef_growth',
    };
    setWeekly(allDays);
    publishWeekly(allDays);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_weekly', JSON.stringify(allDays));
    }

    setDailySavedSuccess(true);
    setTimeout(() => setDailySavedSuccess(false), 3000);
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
          {/* Photoperiod Builder Card */}
          <div className="card-elevated" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Daily Photoperiod Program ({calculatePhotoperiodHours(photoStart, photoEnd)}h)
                </span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {`Reef Growth (${calculatePhotoperiodHours(photoStart, photoEnd)}h Daily: ${photoStart} – ${photoEnd})`}
                </div>
              </div>

              <button
                onClick={handleSavePhotoperiod}
                className="btn-primary"
                style={{
                  width: 'auto',
                  padding: '0.55rem 1.15rem',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: dailySavedSuccess ? '#10b981' : '#ffffff',
                  color: '#000000',
                  fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                }}
              >
                {dailySavedSuccess ? <Check size={16} /> : <Save size={16} />}
                <span>{dailySavedSuccess ? 'Saved & Applied!' : 'Save & Apply to Light'}</span>
              </button>
            </div>

            {/* Quick 9h Daylight Summary Banner */}
            <div
              style={{
                padding: '0.75rem 0.95rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.78rem',
                color: '#38bdf8',
                marginBottom: '1.15rem',
              }}
            >
              <Clock size={18} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.84rem' }}>
                  {photoStart} to {photoEnd} • {calculatePhotoperiodHours(photoStart, photoEnd)} Hours Total Daily Photoperiod
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                  Sunrise ramp ({photoRampMin}m) • Daylight Peak ({photoBlue}% Blue, {photoUv}% UV, {photoWhite}% White) • Sunset ramp ({photoRampMin}m)
                </span>
              </div>
            </div>

            {/* Timing Controls (Start, End, Ramp) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                  Lights On (Start)
                </label>
                <input
                  type="time"
                  value={photoStart}
                  onChange={(e) => handlePhotoperiodChange(e.target.value, photoEnd, photoRampMin, photoBlue, photoWhite, photoUv)}
                  style={{ width: '100%', padding: '0.45rem', fontSize: '0.85rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', color: '#ffffff' }}
                />
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                  Lights Off (End)
                </label>
                <input
                  type="time"
                  value={photoEnd}
                  onChange={(e) => handlePhotoperiodChange(photoStart, e.target.value, photoRampMin, photoBlue, photoWhite, photoUv)}
                  style={{ width: '100%', padding: '0.45rem', fontSize: '0.85rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', color: '#ffffff' }}
                />
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                  Ramp Duration
                </label>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {[30, 45, 60, 90].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => handlePhotoperiodChange(photoStart, photoEnd, mins, photoBlue, photoWhite, photoUv)}
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.2rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-sm)',
                        background: photoRampMin === mins ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        border: photoRampMin === mins ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                        color: photoRampMin === mins ? '#38bdf8' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Target Peak Intensity Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Daylight Peak Intensities
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  Auto-interpolated smooth linear ramps
                </span>
              </div>

              {/* Blue Channel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--channel-blue)' }}>
                    Royal Blue
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={photoBlue}
                      onChange={(e) => handlePhotoperiodChange(photoStart, photoEnd, photoRampMin, Math.min(100, Math.max(0, Number(e.target.value))), photoWhite, photoUv)}
                      style={{ width: '50px', padding: '0.25rem 0.4rem', fontSize: '0.82rem', fontWeight: 800, textAlign: 'center', borderRadius: 'var(--radius-sm)', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--channel-blue)' }}
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--channel-blue)' }}>%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={photoBlue}
                  onChange={(e) => handlePhotoperiodChange(photoStart, photoEnd, photoRampMin, Number(e.target.value), photoWhite, photoUv)}
                  style={{ width: '100%', accentColor: 'var(--channel-blue)', height: '6px' }}
                />
              </div>

              {/* UV Channel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--channel-uv)' }}>
                    Actinic UV
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={photoUv}
                      onChange={(e) => handlePhotoperiodChange(photoStart, photoEnd, photoRampMin, photoBlue, photoWhite, Math.min(100, Math.max(0, Number(e.target.value))))}
                      style={{ width: '50px', padding: '0.25rem 0.4rem', fontSize: '0.82rem', fontWeight: 800, textAlign: 'center', borderRadius: 'var(--radius-sm)', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)', color: 'var(--channel-uv)' }}
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--channel-uv)' }}>%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={photoUv}
                  onChange={(e) => handlePhotoperiodChange(photoStart, photoEnd, photoRampMin, photoBlue, photoWhite, Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--channel-uv)', height: '6px' }}
                />
              </div>

              {/* White Channel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--channel-white)' }}>
                    Day White
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={photoWhite}
                      onChange={(e) => handlePhotoperiodChange(photoStart, photoEnd, photoRampMin, photoBlue, Math.min(100, Math.max(0, Number(e.target.value))), photoUv)}
                      style={{ width: '50px', padding: '0.25rem 0.4rem', fontSize: '0.82rem', fontWeight: 800, textAlign: 'center', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', color: 'var(--channel-white)' }}
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--channel-white)' }}>%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={photoWhite}
                  onChange={(e) => handlePhotoperiodChange(photoStart, photoEnd, photoRampMin, photoBlue, Number(e.target.value), photoUv)}
                  style={{ width: '100%', accentColor: 'var(--channel-white)', height: '6px' }}
                />
              </div>
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

          {/* Collapsible Keyframes (Optional Details) */}
          <div className="card-elevated" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sliders size={14} color="var(--channel-blue)" />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Detailed Keyframe Points ({activeSchedule.keyframes.length} Points)
                </span>
              </div>
              <button
                onClick={() => setShowRawKeyframes(!showRawKeyframes)}
                className="btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
              >
                <span>{showRawKeyframes ? 'Hide Details' : 'Show Details'}</span>
              </button>
            </div>

            {showRawKeyframes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.85rem' }}>
                {activeSchedule.keyframes.map((kf) => (
                  <div
                    key={kf.time}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#ffffff', minWidth: '55px' }}>
                      {kf.time}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.76rem' }}>
                      <span style={{ color: 'var(--channel-blue)' }}>Blue: {kf.blue}%</span>
                      <span style={{ color: 'var(--channel-white)' }}>White: {kf.white}%</span>
                      <span style={{ color: 'var(--channel-uv)' }}>UV: {kf.uv}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
