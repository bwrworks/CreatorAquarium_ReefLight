'use client';

import React, { useState, useEffect } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { SpectrumVisualizer } from '../../components/SpectrumVisualizer';
import {
  RotateCcw,
  Sparkles,
  Sun,
  Moon,
  Flame,
  Fan,
  PowerOff,
  Search,
  Check,
  CalendarPlus,
  BookmarkPlus,
  Clock,
  Trash2,
  X,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { Channels, Schedule, Keyframe } from '../../lib/types';

interface CustomPreset {
  id: string;
  name: string;
  channels: Channels;
  fan: number;
}

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
  return (h || 0) * 3600 + (m || 0) * 60;
}

export default function ManualPage() {
  const { deviceState, publishChannels, publishFan, publishMode, publishSchedule } = useDeviceMqtt();

  const [channels, setChannels] = useState<Channels>({
    blue: deviceState.live.blue,
    white: deviceState.live.white,
    uv: deviceState.live.uv,
  });

  const [fanSpeed, setFanSpeed] = useState<number>(deviceState.live.fan || 40);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const isInteractingRef = React.useRef<boolean>(false);
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const prevModeRef = React.useRef(deviceState.mode);

  // Save Modal & Preset state
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveTab, setSaveTab] = useState<'schedule' | 'preset'>('schedule');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('natural_reef');
  const [scheduleTime, setScheduleTime] = useState<string>('12:00');
  const [customPresetName, setCustomPresetName] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [availableSchedules, setAvailableSchedules] = useState<Schedule[]>(defaultSchedules);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);

  // Load schedules and custom presets on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSchedules = localStorage.getItem('reef_schedules');
      if (savedSchedules) {
        try {
          const parsed = JSON.parse(savedSchedules);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAvailableSchedules(parsed);
            setSelectedScheduleId(parsed[0].id);
          }
        } catch {
          // ignore
        }
      }

      const savedPresets = localStorage.getItem('reef_custom_presets');
      if (savedPresets) {
        try {
          const parsed = JSON.parse(savedPresets);
          if (Array.isArray(parsed)) {
            setCustomPresets(parsed);
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Sync from device only when not actively interacting or when mode reverts to auto
  useEffect(() => {
    if (!isInteractingRef.current || (prevModeRef.current === 'manual' && deviceState.mode === 'auto')) {
      setChannels({
        blue: deviceState.live.blue,
        white: deviceState.live.white,
        uv: deviceState.live.uv,
      });
      setFanSpeed(deviceState.live.fan);
    }
    prevModeRef.current = deviceState.mode;
  }, [deviceState.live, deviceState.mode]);

  const handleSliderChange = (channelKey: keyof Channels, value: number) => {
    isInteractingRef.current = true;
    const updated = { ...channels, [channelKey]: value };
    setChannels(updated);
    setActivePreset(null);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      publishChannels(updated);
    }, 50);

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 1200);
  };

  const handleFanChange = (value: number) => {
    setFanSpeed(value);
    publishFan(value);
  };

  const applyPreset = (name: string, presetChannels: Channels, fan: number) => {
    isInteractingRef.current = true;
    setActivePreset(name);
    setChannels(presetChannels);
    setFanSpeed(fan);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    publishChannels(presetChannels);
    publishFan(fan);

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 1200);
  };

  const handleRevertAuto = () => {
    isInteractingRef.current = false;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    publishMode('auto');
  };

  const handleOpenSaveModal = () => {
    // Default time to device current time if available, or local time
    if (deviceState.time) {
      try {
        const d = new Date(deviceState.time);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        setScheduleTime(`${hh}:${mm}`);
      } catch {
        // fallback
      }
    } else {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      setScheduleTime(`${hh}:${mm}`);
    }

    if (deviceState.activeScheduleId) {
      setSelectedScheduleId(deviceState.activeScheduleId);
    }
    setShowSaveModal(true);
    setStatusMessage(null);
  };

  const handleSaveToSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const targetSchedule = availableSchedules.find((s) => s.id === selectedScheduleId);
    if (!targetSchedule) return;

    const newKeyframe: Keyframe = {
      time: scheduleTime,
      blue: Math.round(channels.blue),
      white: Math.round(channels.white),
      uv: Math.round(channels.uv),
    };

    // Filter out duplicate at same time, then insert and sort
    const updatedKeyframes = [
      ...targetSchedule.keyframes.filter((k) => k.time !== scheduleTime),
      newKeyframe,
    ].sort((a, b) => timeToSec(a.time) - timeToSec(b.time));

    const updatedSchedule: Schedule = {
      ...targetSchedule,
      keyframes: updatedKeyframes,
    };

    const updatedList = availableSchedules.map((s) => (s.id === targetSchedule.id ? updatedSchedule : s));
    setAvailableSchedules(updatedList);

    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_schedules', JSON.stringify(updatedList));
    }

    // Immediately sync the updated schedule to ESP32 Flash memory over MQTT
    publishSchedule(updatedSchedule);

    setStatusMessage(`Added point at ${scheduleTime} (B:${newKeyframe.blue}%, W:${newKeyframe.white}%, UV:${newKeyframe.uv}%) to "${targetSchedule.name}" and synced to ESP32!`);
    setTimeout(() => {
      setShowSaveModal(false);
      setStatusMessage(null);
    }, 2000);
  };

  const handleSaveCustomPreset = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customPresetName.trim() || `Custom Mix ${customPresets.length + 1}`;
    const newPreset: CustomPreset = {
      id: `preset_${Date.now()}`,
      name,
      channels: {
        blue: Math.round(channels.blue),
        white: Math.round(channels.white),
        uv: Math.round(channels.uv),
      },
      fan: Math.round(fanSpeed),
    };

    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_custom_presets', JSON.stringify(updated));
    }

    setCustomPresetName('');
    setStatusMessage(`Saved profile "${name}" to Quick Lighting Profiles!`);
    setTimeout(() => {
      setShowSaveModal(false);
      setStatusMessage(null);
    }, 1500);
  };

  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_custom_presets', JSON.stringify(updated));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Card */}
      <div
        className="card-surface"
        style={{
          padding: '1.15rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.02em' }}>
              Manual Fixture Control
            </h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.55rem',
                borderRadius: '6px',
                background: deviceState.mode === 'manual' ? '#fef3c7' : '#e0f2fe',
                color: deviceState.mode === 'manual' ? '#b45309' : '#0369a1',
                border: `1px solid ${deviceState.mode === 'manual' ? '#fde68a' : '#bae6fd'}`,
              }}
            >
              {deviceState.mode === 'manual' ? '● Manual Override' : '● Auto Schedule'}
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
            {deviceState.mode === 'manual'
              ? 'Direct PWM active • Levels hold for 15 minutes before schedule automatically resumes'
              : 'Direct PWM control • Move any slider or select a profile to enter manual mode'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenSaveModal}
            className="btn-secondary"
            id="save-to-schedule-btn"
            style={{
              fontSize: '0.78rem',
              padding: '0.5rem 0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #bbf7d0',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <CalendarPlus size={14} color="#16a34a" /> Save to Schedule / Presets
          </button>

          <button
            onClick={handleRevertAuto}
            className="btn-secondary"
            id="revert-auto-btn"
            style={{
              fontSize: '0.78rem',
              padding: '0.5rem 0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: deviceState.mode === 'manual' ? '#0284c7' : '#ffffff',
              color: deviceState.mode === 'manual' ? '#ffffff' : '#475569',
              border: deviceState.mode === 'manual' ? '1px solid #0284c7' : '1px solid #cbd5e1',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: deviceState.mode === 'manual' ? '0 2px 6px rgba(2, 132, 199, 0.3)' : 'none',
            }}
          >
            <RotateCcw size={14} /> Resume Auto Schedule
          </button>
        </div>
      </div>

      {/* Manual Override Status Banner */}
      {deviceState.mode === 'manual' && (
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
            <RotateCcw size={16} color="#d97706" />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e' }}>
                Manual Override Active
              </div>
              <div style={{ fontSize: '0.72rem', color: '#b45309' }}>
                Fixture is holding these slider values. Auto schedule resumes after 15 minutes of inactivity.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={handleOpenSaveModal}
              className="btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.75rem',
                background: '#ffffff',
                color: '#166534',
                border: '1px solid #bbf7d0',
                fontWeight: 700,
              }}
            >
              <CalendarPlus size={13} /> Save Levels
            </button>
            <button
              onClick={handleRevertAuto}
              className="btn-secondary"
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.75rem',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
              }}
            >
              Resume Auto
            </button>
          </div>
        </div>
      )}

      {/* Quick Lighting Profiles (Built-in + Custom Saved Presets) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
            Quick Lighting Profiles
          </div>
          <button
            onClick={handleOpenSaveModal}
            style={{
              background: 'none',
              border: 'none',
              color: '#0284c7',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <BookmarkPlus size={13} /> + Save Current as Preset
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.6rem' }}>
          {/* Custom Presets Saved by User */}
          {customPresets.map((preset) => (
            <div
              key={preset.id}
              onClick={() => applyPreset(preset.id, preset.channels, preset.fan)}
              className={`btn-secondary ${activePreset === preset.id ? 'active' : ''}`}
              style={{
                padding: '0.65rem 0.4rem',
                flexDirection: 'column',
                gap: '0.35rem',
                cursor: 'pointer',
                position: 'relative',
                border: activePreset === preset.id ? '2px solid #0284c7' : '1px solid #e0e7ff',
                background: activePreset === preset.id ? '#0284c7' : '#f8faff',
              }}
            >
              <button
                onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                style={{
                  position: 'absolute',
                  top: '3px',
                  right: '3px',
                  background: 'none',
                  border: 'none',
                  color: activePreset === preset.id ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                }}
                title="Delete preset"
              >
                <Trash2 size={11} />
              </button>
              <BookmarkPlus size={16} color={activePreset === preset.id ? '#ffffff' : '#4f46e5'} />
              <span style={{ fontSize: '0.74rem', fontWeight: 700, textAlign: 'center', wordBreak: 'break-word', maxWidth: '90px' }}>
                {preset.name}
              </span>
              <span style={{ fontSize: '0.62rem', opacity: 0.85 }}>
                B:{preset.channels.blue}% W:{preset.channels.white}%
              </span>
            </div>
          ))}

          {/* Standard Presets */}
          <button
            onClick={() => applyPreset('coral', { blue: 100, white: 5, uv: 100 }, 50)}
            className={`btn-secondary ${activePreset === 'coral' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.4rem', flexDirection: 'column', gap: '0.35rem' }}
          >
            <Sparkles size={17} color={activePreset === 'coral' ? '#ffffff' : '#7c3aed'} />
            <span style={{ fontSize: '0.74rem' }}>Coral Pop</span>
          </button>

          <button
            onClick={() => applyPreset('daylight', { blue: 80, white: 70, uv: 50 }, 55)}
            className={`btn-secondary ${activePreset === 'daylight' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.4rem', flexDirection: 'column', gap: '0.35rem' }}
          >
            <Sun size={17} color={activePreset === 'daylight' ? '#ffffff' : '#0284c7'} />
            <span style={{ fontSize: '0.74rem' }}>Daylight</span>
          </button>

          <button
            onClick={() => applyPreset('sunset', { blue: 50, white: 35, uv: 20 }, 40)}
            className={`btn-secondary ${activePreset === 'sunset' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.4rem', flexDirection: 'column', gap: '0.35rem' }}
          >
            <Flame size={17} color={activePreset === 'sunset' ? '#ffffff' : '#f59e0b'} />
            <span style={{ fontSize: '0.74rem' }}>Warm Dusk</span>
          </button>

          <button
            onClick={() => applyPreset('moon', { blue: 6, white: 0, uv: 0 }, 20)}
            className={`btn-secondary ${activePreset === 'moon' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.4rem', flexDirection: 'column', gap: '0.35rem' }}
          >
            <Moon size={17} color={activePreset === 'moon' ? '#ffffff' : '#2563eb'} />
            <span style={{ fontSize: '0.74rem' }}>Moonlight</span>
          </button>

          <button
            onClick={() => applyPreset('inspect', { blue: 100, white: 100, uv: 100 }, 75)}
            className={`btn-secondary ${activePreset === 'inspect' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.4rem', flexDirection: 'column', gap: '0.35rem' }}
          >
            <Search size={17} color={activePreset === 'inspect' ? '#ffffff' : '#09090b'} />
            <span style={{ fontSize: '0.74rem' }}>Inspection</span>
          </button>

          <button
            onClick={() => applyPreset('off', { blue: 0, white: 0, uv: 0 }, 0)}
            className={`btn-secondary ${activePreset === 'off' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.4rem', flexDirection: 'column', gap: '0.35rem' }}
          >
            <PowerOff size={17} color={activePreset === 'off' ? '#ffffff' : '#64748b'} />
            <span style={{ fontSize: '0.74rem' }}>Lights Off</span>
          </button>
        </div>
      </div>

      {/* 3 LED Channel Sliders */}
      <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
            Individual Color Channels
          </h3>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            GPIO 18, 19, 32, 33
          </span>
        </div>

        {/* Blue Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-blue)' }}>
              Royal Blue (450nm) — 10 LEDs
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--channel-blue)', background: 'var(--channel-blue-bg)', border: '1px solid var(--channel-blue-border)', padding: '0.15rem 0.55rem', borderRadius: '6px' }}>
              {Math.round(channels.blue)}%
            </span>
          </div>
          <input type="range" min="0" max="100" value={channels.blue}
            onChange={(e) => handleSliderChange('blue', Number(e.target.value))}
            className="range-slider" id="slider-blue" />
        </div>

        {/* White Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-white)' }}>
              Day White (6500K) — 4 LEDs
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--channel-white)', background: 'var(--channel-white-bg)', border: '1px solid var(--channel-white-border)', padding: '0.15rem 0.55rem', borderRadius: '6px' }}>
              {Math.round(channels.white)}%
            </span>
          </div>
          <input type="range" min="0" max="100" value={channels.white}
            onChange={(e) => handleSliderChange('white', Number(e.target.value))}
            className="range-slider" id="slider-white" />
        </div>

        {/* UV Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-uv)' }}>
              Actinic UV (405nm) — 2 LEDs
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--channel-uv)', background: 'var(--channel-uv-bg)', border: '1px solid var(--channel-uv-border)', padding: '0.15rem 0.55rem', borderRadius: '6px' }}>
              {Math.round(channels.uv)}%
            </span>
          </div>
          <input type="range" min="0" max="100" value={channels.uv}
            onChange={(e) => handleSliderChange('uv', Number(e.target.value))}
            className="range-slider" id="slider-uv" />
        </div>

        {/* Quick Schedule Save CTA right under sliders */}
        <button
          onClick={handleOpenSaveModal}
          className="btn-secondary"
          style={{
            marginTop: '0.2rem',
            padding: '0.65rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            fontSize: '0.8rem',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            color: '#0369a1',
            fontWeight: 700,
          }}
        >
          <CalendarPlus size={15} color="#0284c7" />
          Save These Manual Settings ({Math.round(channels.blue)}% / {Math.round(channels.white)}% / {Math.round(channels.uv)}%) to a Schedule or Preset
        </button>
      </div>

      {/* Fan Speed Slider */}
      <div className="card-surface" style={{ padding: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-fan)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Fan size={16} /> Cooling Fan Speed
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 800,
              color: 'var(--channel-fan)',
              background: 'var(--channel-fan-bg)',
              border: '1px solid var(--channel-fan-border)',
              padding: '0.15rem 0.55rem',
              borderRadius: '6px',
            }}
          >
            {Math.round(fanSpeed)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={fanSpeed}
          onChange={(e) => handleFanChange(Number(e.target.value))}
          className="range-slider"
          id="slider-fan"
        />
      </div>

      {/* Real-Time Resulting Spectrum Underneath */}
      <SpectrumVisualizer channels={channels} title="Resulting Light Spectrum (Live Mix)" />

      {/* Modal: Save Manual Levels into Schedule or as Custom Preset */}
      {showSaveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="card-surface"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '1.5rem',
              background: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CalendarPlus size={18} color="#0284c7" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#09090b' }}>
                  Save Light Settings
                </h3>
              </div>
              <button
                onClick={() => setShowSaveModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Current Levels Summary Pill Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.4rem',
                background: '#f8fafc',
                padding: '0.65rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--channel-blue)' }}>BLUE</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--channel-blue)' }}>{Math.round(channels.blue)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--channel-white)' }}>WHITE</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--channel-white)' }}>{Math.round(channels.white)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--channel-uv)' }}>UV</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--channel-uv)' }}>{Math.round(channels.uv)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--channel-fan)' }}>FAN</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--channel-fan)' }}>{Math.round(fanSpeed)}%</div>
              </div>
            </div>

            {/* Notification Banner */}
            {statusMessage && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                <CheckCircle2 size={15} color="#16a34a" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Tabs: Save to Schedule vs Save as Preset */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setSaveTab('schedule')}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  background: 'none',
                  border: 'none',
                  borderBottom: saveTab === 'schedule' ? '2px solid #0284c7' : '2px solid transparent',
                  color: saveTab === 'schedule' ? '#0284c7' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                }}
              >
                <Layers size={14} /> Add into a Schedule
              </button>

              <button
                type="button"
                onClick={() => setSaveTab('preset')}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  background: 'none',
                  border: 'none',
                  borderBottom: saveTab === 'preset' ? '2px solid #0284c7' : '2px solid transparent',
                  color: saveTab === 'preset' ? '#0284c7' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                }}
              >
                <BookmarkPlus size={14} /> Save as Quick Profile
              </button>
            </div>

            {/* Tab 1 Form: Add to Schedule */}
            {saveTab === 'schedule' && (
              <form onSubmit={handleSaveToSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                    Select Target Schedule
                  </label>
                  <select
                    value={selectedScheduleId}
                    onChange={(e) => setSelectedScheduleId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#09090b',
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
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                    Scheduled Time of Day (24-Hour)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      required
                      style={{
                        flex: 1,
                        padding: '0.55rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#09090b',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                      }}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      (Linear interpolation)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1, padding: '0.65rem', fontSize: '0.82rem' }}
                  >
                    <Check size={14} /> Save Point to Schedule & Sync ESP32
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(false)}
                    className="btn-secondary"
                    style={{ padding: '0.65rem', fontSize: '0.82rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2 Form: Save as Quick Profile */}
            {saveTab === 'preset' && (
              <form onSubmit={handleSaveCustomPreset} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
                    Profile Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Deep Blue Evening, Coral Feeding..."
                    value={customPresetName}
                    onChange={(e) => setCustomPresetName(e.target.value)}
                    required
                    maxLength={24}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#09090b',
                      fontSize: '0.85rem',
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                    Saves to your Quick Lighting Profiles grid for 1-click activation.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1, padding: '0.65rem', fontSize: '0.82rem' }}
                  >
                    <Check size={14} /> Add to Quick Profiles
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(false)}
                    className="btn-secondary"
                    style={{ padding: '0.65rem', fontSize: '0.82rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
