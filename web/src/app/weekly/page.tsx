'use client';

import React, { useState, useEffect } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { WeeklyAssignment, Schedule } from '../../lib/types';
import { Calendar, Save, Check, Sparkles, Layers } from 'lucide-react';

const defaultWeekly: WeeklyAssignment = {
  mon: 'natural_reef',
  tue: 'natural_reef',
  wed: 'natural_reef',
  thu: 'natural_reef',
  fri: 'natural_reef',
  sat: 'natural_reef',
  sun: 'natural_reef',
};

const days: { key: keyof WeeklyAssignment; label: string; full: string }[] = [
  { key: 'mon', label: 'MON', full: 'Monday' },
  { key: 'tue', label: 'TUE', full: 'Tuesday' },
  { key: 'wed', label: 'WED', full: 'Wednesday' },
  { key: 'thu', label: 'THU', full: 'Thursday' },
  { key: 'fri', label: 'FRI', full: 'Friday' },
  { key: 'sat', label: 'SAT', full: 'Saturday' },
  { key: 'sun', label: 'SUN', full: 'Sunday' },
];

export default function WeeklyPage() {
  const { publishWeekly } = useDeviceMqtt();

  const [weekly, setWeekly] = useState<WeeklyAssignment>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reef_weekly');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return defaultWeekly;
  });

  const [availableSchedules, setAvailableSchedules] = useState<{ id: string; name: string }[]>([
    { id: 'natural_reef', name: 'Natural Reef Daylight' },
    { id: 'deep_coral_pop', name: 'High Fluorescent Actinic Pop' },
  ]);

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reef_schedules');
      if (saved) {
        try {
          const parsed: Schedule[] = JSON.parse(saved);
          setAvailableSchedules(parsed.map((s) => ({ id: s.id, name: s.name })));
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const handleDayChange = (day: keyof WeeklyAssignment, scheduleId: string) => {
    const updated = { ...weekly, [day]: scheduleId };
    setWeekly(updated);
  };

  const handleSaveWeekly = () => {
    publishWeekly(weekly);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_weekly', JSON.stringify(weekly));
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const applyPresetAll = (scheduleId: string) => {
    const updated: WeeklyAssignment = {
      mon: scheduleId,
      tue: scheduleId,
      wed: scheduleId,
      thu: scheduleId,
      fri: scheduleId,
      sat: scheduleId,
      sun: scheduleId,
    };
    setWeekly(updated);
  };

  const applyWeekdayWeekend = (weekdayId: string, weekendId: string) => {
    const updated: WeeklyAssignment = {
      mon: weekdayId,
      tue: weekdayId,
      wed: weekdayId,
      thu: weekdayId,
      fri: weekdayId,
      sat: weekendId,
      sun: weekendId,
    };
    setWeekly(updated);
  };

  const todayKey = days[(new Date().getDay() + 6) % 7].key;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Card */}
      <div className="card-surface" style={{ padding: '1.15rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.02em' }}>
          Weekly Schedule Routing
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
          Assign an autonomous lighting profile to each day of the week
        </p>
      </div>

      {/* Shortcuts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
        <button
          onClick={() => applyPresetAll('natural_reef')}
          className="btn-secondary"
          style={{ fontSize: '0.75rem', padding: '0.55rem' }}
        >
          <Sparkles size={14} color="#0284c7" /> All Days: Daylight
        </button>
        <button
          onClick={() => applyWeekdayWeekend('natural_reef', 'deep_coral_pop')}
          className="btn-secondary"
          style={{ fontSize: '0.75rem', padding: '0.55rem' }}
        >
          <Layers size={14} color="#7c3aed" /> Weekday / Weekend
        </button>
      </div>

      {/* 7-Day Grid */}
      <div className="card-surface" style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {days.map((day) => {
          const isToday = day.key === todayKey;
          return (
            <div
              key={day.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.7rem 0.85rem',
                borderRadius: '8px',
                background: isToday ? '#f0f9ff' : '#ffffff',
                border: isToday ? '1px solid #bae6fd' : '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: isToday ? '#0284c7' : '#f1f5f9',
                    color: isToday ? '#ffffff' : '#09090b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                  }}
                >
                  {day.label}
                </div>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#09090b' }}>
                    {day.full}
                  </div>
                  {isToday && (
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0284c7' }}>
                      CURRENT DAY
                    </div>
                  )}
                </div>
              </div>

              <select
                value={weekly[day.key]}
                onChange={(e) => handleDayChange(day.key, e.target.value)}
                style={{
                  background: '#ffffff',
                  color: '#09090b',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '0.45rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  outline: 'none',
                  maxWidth: '175px',
                }}
              >
                {availableSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        <button
          onClick={handleSaveWeekly}
          className="btn-primary"
          id="save-weekly-btn"
          style={{ marginTop: '0.5rem' }}
        >
          {savedSuccess ? (
            <>
              <Check size={16} /> Saved to ESP32 Flash
            </>
          ) : (
            <>
              <Save size={16} /> Save Weekly Assignment
            </>
          )}
        </button>
      </div>
    </div>
  );
}
