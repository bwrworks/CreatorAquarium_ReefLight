'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useDeviceMqtt } from '../../lib/MqttContext';
import { SpectrumVisualizer } from '../../components/SpectrumVisualizer';
import { AppleControlSlider } from '../../components/AppleControlSlider';
import {
  RotateCcw,
  Sparkles,
  Sun,
  Moon,
  Flame,
  Fan,
  PowerOff,
  Search,
  CalendarPlus,
  BookmarkPlus,
  Trash2,
  X,
  Layers,
  CheckCircle2,
  Sliders,
  AlertTriangle,
  ShieldAlert,
  Lock,
  Unlock,
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

  // Mandatory Coral Safety Rule (>60% Protection)
  const [isHighCapacityUnlocked, setIsHighCapacityUnlocked] = useState<boolean>(false);
  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<
    | { type: 'channel'; channel: keyof Channels; value: number }
    | { type: 'preset'; name: string; channels: Channels; fan: number }
    | null
  >(null);

  // Interaction & Throttling Refs for Glitch-Free Real-Time Control
  const isInteractingRef = useRef<boolean>(false);
  const interactionGraceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestChannelsRef = useRef<Channels>(channels);
  const latestFanRef = useRef<number>(fanSpeed);
  const lastPublishChannelsTimeRef = useRef<number>(0);
  const lastPublishFanTimeRef = useRef<number>(0);
  const trailingChannelsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const trailingFanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevModeRef = useRef(deviceState.mode);

  // Keep refs in sync with state
  useEffect(() => {
    latestChannelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    latestFanRef.current = fanSpeed;
  }, [fanSpeed]);

  // Save Modal & Preset state
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveTab, setSaveTab] = useState<'schedule' | 'preset'>('schedule');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('natural_reef');
  const [scheduleTime, setScheduleTime] = useState<string>('12:00');
  const [customPresetName, setCustomPresetName] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [availableSchedules, setAvailableSchedules] = useState<Schedule[]>(defaultSchedules);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);

  // Load schedules from localStorage and presets centrally from /api/presets (with local fallback)
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

      // Initial load from local cache
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

      // Fetch central presets from server route so mobile and desktop sync seamlessly
      fetch('/api/presets')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setCustomPresets(data);
            localStorage.setItem('reef_custom_presets', JSON.stringify(data));
          }
        })
        .catch((err) => {
          console.warn('[Presets] Could not fetch server presets, using local cache:', err);
        });
    }
  }, []);

  // Sync from device only when user is NOT actively touching/dragging
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

  const handleSliderDragStart = () => {
    isInteractingRef.current = true;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);
  };

  const handleSliderChange = (channelKey: keyof Channels, value: number) => {
    isInteractingRef.current = true;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);

    const updated = { ...channels, [channelKey]: value };
    setChannels(updated);
    latestChannelsRef.current = updated;
    setActivePreset(null);

    // Throttle publishing to ESP32 at ~11 Hz (every 85ms) while dragging
    const now = Date.now();
    if (now - lastPublishChannelsTimeRef.current >= 85) {
      lastPublishChannelsTimeRef.current = now;
      publishChannels(updated);
    }

    // Trailing edge timer guarantees final intermediate step is never lost
    if (trailingChannelsTimerRef.current) clearTimeout(trailingChannelsTimerRef.current);
    trailingChannelsTimerRef.current = setTimeout(() => {
      publishChannels(latestChannelsRef.current);
    }, 90);
  };

  const handleSliderDragEnd = (channelKey: keyof Channels, finalVal: number) => {
    if (trailingChannelsTimerRef.current) clearTimeout(trailingChannelsTimerRef.current);
    const updated = { ...latestChannelsRef.current, [channelKey]: finalVal };
    setChannels(updated);
    latestChannelsRef.current = updated;
    publishChannels(updated);

    // Lock out incoming echoes for 2000ms after release to eliminate jitter
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);
    interactionGraceTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2000);
  };

  const handleFanChange = (value: number) => {
    isInteractingRef.current = true;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);

    setFanSpeed(value);
    latestFanRef.current = value;

    const now = Date.now();
    if (now - lastPublishFanTimeRef.current >= 85) {
      lastPublishFanTimeRef.current = now;
      publishFan(value);
    }

    if (trailingFanTimerRef.current) clearTimeout(trailingFanTimerRef.current);
    trailingFanTimerRef.current = setTimeout(() => {
      publishFan(latestFanRef.current);
    }, 90);
  };

  const handleFanDragEnd = (finalVal: number) => {
    if (trailingFanTimerRef.current) clearTimeout(trailingFanTimerRef.current);
    setFanSpeed(finalVal);
    latestFanRef.current = finalVal;
    publishFan(finalVal);

    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);
    interactionGraceTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2000);
  };

  const executeApplyPreset = (name: string, presetChannels: Channels, fan: number) => {
    isInteractingRef.current = true;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);
    if (trailingChannelsTimerRef.current) clearTimeout(trailingChannelsTimerRef.current);
    if (trailingFanTimerRef.current) clearTimeout(trailingFanTimerRef.current);

    setActivePreset(name);
    setChannels(presetChannels);
    setFanSpeed(fan);
    latestChannelsRef.current = presetChannels;
    latestFanRef.current = fan;

    publishChannels(presetChannels);
    publishFan(fan);

    interactionGraceTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2000);
  };

  const applyPreset = (name: string, presetChannels: Channels, fan: number) => {
    const hasAbove60 =
      presetChannels.blue > 60 || presetChannels.white > 60 || presetChannels.uv > 60;

    if (hasAbove60 && !isHighCapacityUnlocked) {
      // Safely clamp channels to 60% immediately so corals are protected
      const safeClamped: Channels = {
        blue: Math.min(presetChannels.blue, 60),
        white: Math.min(presetChannels.white, 60),
        uv: Math.min(presetChannels.uv, 60),
      };
      executeApplyPreset(name, safeClamped, fan);

      // Prompt user to confirm before unlocking full >60% capacity
      setPendingAction({ type: 'preset', name, channels: presetChannels, fan });
      setShowSafetyModal(true);
      return;
    }

    executeApplyPreset(name, presetChannels, fan);
  };

  const handleUnlockSafetyConfirmation = () => {
    setIsHighCapacityUnlocked(true);
    setShowSafetyModal(false);

    if (pendingAction) {
      if (pendingAction.type === 'channel') {
        handleSliderChange(pendingAction.channel, pendingAction.value);
        handleSliderDragEnd(pendingAction.channel, pendingAction.value);
      } else if (pendingAction.type === 'preset') {
        executeApplyPreset(
          pendingAction.name,
          pendingAction.channels,
          pendingAction.fan
        );
      }
      setPendingAction(null);
    }
  };

  const handleCancelSafetyConfirmation = () => {
    setShowSafetyModal(false);
    setPendingAction(null);
  };

  const handleReLockToSafeCap = () => {
    setIsHighCapacityUnlocked(false);
    // Clamp any channel currently exceeding 60% down to 60%
    const clamped: Channels = {
      blue: Math.min(channels.blue, 60),
      white: Math.min(channels.white, 60),
      uv: Math.min(channels.uv, 60),
    };
    setChannels(clamped);
    latestChannelsRef.current = clamped;
    publishChannels(clamped);
  };

  const handleRevertAuto = () => {
    isInteractingRef.current = false;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);
    if (trailingChannelsTimerRef.current) clearTimeout(trailingChannelsTimerRef.current);
    if (trailingFanTimerRef.current) clearTimeout(trailingFanTimerRef.current);
    publishMode('auto');
  };

  const handleOpenSaveModal = () => {
    if (deviceState.time) {
      try {
        const d = new Date(deviceState.time);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        setScheduleTime(`${hh}:${mm}`);
      } catch {
        setScheduleTime('12:00');
      }
    }
    setShowSaveModal(true);
  };

  const handleSaveToSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const targetSchedule = availableSchedules.find((s) => s.id === selectedScheduleId);
    if (!targetSchedule) return;

    const newSec = timeToSec(scheduleTime);
    const existingIndex = targetSchedule.keyframes.findIndex((k) => k.time === scheduleTime);

    const newKeyframe: Keyframe = {
      time: scheduleTime,
      blue: Math.round(channels.blue),
      white: Math.round(channels.white),
      uv: Math.round(channels.uv),
    };

    let updatedKeyframes = [...targetSchedule.keyframes];
    if (existingIndex >= 0) {
      updatedKeyframes[existingIndex] = newKeyframe;
    } else {
      updatedKeyframes.push(newKeyframe);
      updatedKeyframes.sort((a, b) => timeToSec(a.time) - timeToSec(b.time));
    }

    const updatedSchedule: Schedule = {
      ...targetSchedule,
      keyframes: updatedKeyframes,
    };

    const updatedList = availableSchedules.map((s) => (s.id === targetSchedule.id ? updatedSchedule : s));
    setAvailableSchedules(updatedList);

    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_schedules', JSON.stringify(updatedList));
    }

    publishSchedule(updatedSchedule);

    setStatusMessage(`Saved point at ${scheduleTime} to "${targetSchedule.name}" and synced to ESP32!`);
    setTimeout(() => {
      setShowSaveModal(false);
      setStatusMessage(null);
    }, 1800);
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

    // Persist to central server route for cross-device synchronization
    fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch((err) => console.error('Failed to sync preset to server:', err));

    setCustomPresetName('');
    setStatusMessage(`Saved "${name}" to Quick Profiles!`);
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

    // Delete centrally on server
    fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch((err) => console.error('Failed to sync delete to server:', err));
  };

  const isManual = deviceState.mode === 'manual';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Bar */}
      <div
        className="card-surface"
        style={{
          padding: '1.15rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Manual Controls
            </h2>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                background: isManual ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                color: isManual ? '#f59e0b' : '#38bdf8',
                border: `1px solid ${isManual ? 'rgba(245, 158, 11, 0.3)' : 'rgba(56, 189, 248, 0.25)'}`,
              }}
            >
              {isManual ? 'Manual Mode (Active)' : 'Schedule Active'}
            </span>

            {/* Coral Safety Status Tag */}
            {isHighCapacityUnlocked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <Unlock size={11} /> High Capacity (&gt;60%)
                </span>
                <button
                  onClick={handleReLockToSafeCap}
                  className="btn-pill"
                  style={{
                    fontSize: '0.66rem',
                    padding: '0.15rem 0.55rem',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                  title="Lock max output back to 60% coral safety threshold"
                >
                  <Lock size={10} /> Lock to 60% Cap
                </button>
              </div>
            ) : (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <Lock size={11} /> 60% Safe Cap Active
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {isManual
              ? 'Manual levels locked permanently • Remains active until you click Resume Auto or start Acclimation'
              : 'Direct tactile PWM control • Adjust any slider to take over'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenSaveModal}
            className="btn-pill"
            id="save-to-schedule-btn"
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <CalendarPlus size={13} /> Save Levels
          </button>

          {isManual && (
            <button
              onClick={handleRevertAuto}
              className="btn-pill"
              id="revert-auto-btn"
              style={{
                background: '#ffffff',
                color: '#000000',
                border: 'none',
                fontWeight: 800,
              }}
            >
              <RotateCcw size={13} /> Resume Auto
            </button>
          )}
        </div>
      </div>

      {/* Resulting Light Spectrum Visualizer (Top Placement for Instant Visual Feedback) */}
      <SpectrumVisualizer channels={channels} title="Live Light Spectrum" />

      {/* Quick Lighting Profiles (Apple Segmented Grid) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', padding: '0 0.2rem' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Quick Profiles
          </span>
          <button
            onClick={handleOpenSaveModal}
            style={{
              background: 'none',
              border: 'none',
              color: '#38bdf8',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <BookmarkPlus size={13} /> Save Current Mix
          </button>
        </div>

        {/* Built-in Presets */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))',
            gap: '0.5rem',
          }}
        >
          <button
            onClick={() => applyPreset('coral', { blue: 95, white: 10, uv: 100 }, 60)}
            className={`btn-secondary ${activePreset === 'coral' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.5rem', flexDirection: 'column', gap: '0.3rem', borderRadius: 'var(--radius-md)' }}
          >
            <Sparkles size={16} color={activePreset === 'coral' ? '#000000' : '#c084fc'} />
            <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>Coral Pop</span>
          </button>

          <button
            onClick={() => applyPreset('daylight', { blue: 80, white: 70, uv: 50 }, 55)}
            className={`btn-secondary ${activePreset === 'daylight' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.5rem', flexDirection: 'column', gap: '0.3rem', borderRadius: 'var(--radius-md)' }}
          >
            <Sun size={16} color={activePreset === 'daylight' ? '#000000' : '#38bdf8'} />
            <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>Daylight</span>
          </button>

          <button
            onClick={() => applyPreset('sunset', { blue: 50, white: 35, uv: 20 }, 40)}
            className={`btn-secondary ${activePreset === 'sunset' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.5rem', flexDirection: 'column', gap: '0.3rem', borderRadius: 'var(--radius-md)' }}
          >
            <Flame size={16} color={activePreset === 'sunset' ? '#000000' : '#fbbf24'} />
            <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>Warm Dusk</span>
          </button>

          <button
            onClick={() => applyPreset('moon', { blue: 6, white: 0, uv: 0 }, 20)}
            className={`btn-secondary ${activePreset === 'moon' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.5rem', flexDirection: 'column', gap: '0.3rem', borderRadius: 'var(--radius-md)' }}
          >
            <Moon size={16} color={activePreset === 'moon' ? '#000000' : '#60a5fa'} />
            <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>Moonlight</span>
          </button>

          <button
            onClick={() => applyPreset('inspect', { blue: 100, white: 100, uv: 100 }, 75)}
            className={`btn-secondary ${activePreset === 'inspect' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.5rem', flexDirection: 'column', gap: '0.3rem', borderRadius: 'var(--radius-md)' }}
          >
            <Search size={16} color={activePreset === 'inspect' ? '#000000' : '#f4f4f6'} />
            <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>Inspection</span>
          </button>

          <button
            onClick={() => applyPreset('off', { blue: 0, white: 0, uv: 0 }, 0)}
            className={`btn-secondary ${activePreset === 'off' ? 'active' : ''}`}
            style={{ padding: '0.65rem 0.5rem', flexDirection: 'column', gap: '0.3rem', borderRadius: 'var(--radius-md)' }}
          >
            <PowerOff size={16} color={activePreset === 'off' ? '#000000' : 'var(--text-muted)'} />
            <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>Lights Off</span>
          </button>
        </div>

        {/* User-Saved Custom Presets */}
        {customPresets.length > 0 && (
          <div style={{ marginTop: '0.65rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.5rem',
              }}
            >
              {customPresets.map((p) => (
                <div
                  key={p.id}
                  onClick={() => applyPreset(p.name, p.channels, p.fan)}
                  className={`btn-secondary ${activePreset === p.name ? 'active' : ''}`}
                  style={{
                    padding: '0.65rem 0.75rem',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      B:{p.channels.blue}% W:{p.channels.white}% U:{p.channels.uv}%
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteCustomPreset(p.id, e)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Delete custom preset"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Authentic iOS Control Center Tactile Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
        {/* Royal Blue */}
        <AppleControlSlider
          label="Royal Blue"
          sublabel="450nm • 10 LEDs"
          value={channels.blue}
          onChange={(val) => handleSliderChange('blue', val)}
          onDragStart={handleSliderDragStart}
          onDragEnd={(val) => handleSliderDragEnd('blue', val)}
          icon={<Sun size={17} strokeWidth={2.4} />}
          accentColor="#3b82f6"
          fillGradient="linear-gradient(90deg, #1e40af 0%, #3b82f6 100%)"
          glowColor="rgba(59, 130, 246, 0.45)"
          id="slider-blue"
          maxAllowed={isHighCapacityUnlocked ? 100 : 60}
          safetyThreshold={60}
          onRequestUnlock={(attemptedVal) => {
            setPendingAction({ type: 'channel', channel: 'blue', value: attemptedVal });
            setShowSafetyModal(true);
          }}
        />

        {/* Day White */}
        <AppleControlSlider
          label="Day White"
          sublabel="6500K • 4 LEDs"
          value={channels.white}
          onChange={(val) => handleSliderChange('white', val)}
          onDragStart={handleSliderDragStart}
          onDragEnd={(val) => handleSliderDragEnd('white', val)}
          icon={<Sun size={17} strokeWidth={2.4} />}
          accentColor="#38bdf8"
          fillGradient="linear-gradient(90deg, #0369a1 0%, #38bdf8 100%)"
          glowColor="rgba(56, 189, 248, 0.45)"
          id="slider-white"
          maxAllowed={isHighCapacityUnlocked ? 100 : 60}
          safetyThreshold={60}
          onRequestUnlock={(attemptedVal) => {
            setPendingAction({ type: 'channel', channel: 'white', value: attemptedVal });
            setShowSafetyModal(true);
          }}
        />

        {/* Actinic UV */}
        <AppleControlSlider
          label="Actinic UV"
          sublabel="405nm • 2 LEDs"
          value={channels.uv}
          onChange={(val) => handleSliderChange('uv', val)}
          onDragStart={handleSliderDragStart}
          onDragEnd={(val) => handleSliderDragEnd('uv', val)}
          icon={<Sparkles size={17} strokeWidth={2.4} />}
          accentColor="#a855f7"
          fillGradient="linear-gradient(90deg, #6b21a8 0%, #a855f7 100%)"
          glowColor="rgba(168, 85, 247, 0.45)"
          id="slider-uv"
          maxAllowed={isHighCapacityUnlocked ? 100 : 60}
          safetyThreshold={60}
          onRequestUnlock={(attemptedVal) => {
            setPendingAction({ type: 'channel', channel: 'uv', value: attemptedVal });
            setShowSafetyModal(true);
          }}
        />

        {/* Cooling Fan */}
        <AppleControlSlider
          label="Cooling Fan"
          sublabel="Thermal PWM Control"
          value={fanSpeed}
          onChange={(val) => handleFanChange(val)}
          onDragStart={handleSliderDragStart}
          onDragEnd={(val) => handleFanDragEnd(val)}
          icon={<Fan size={17} strokeWidth={2.4} />}
          accentColor="#14b8a6"
          fillGradient="linear-gradient(90deg, #0f766e 0%, #14b8a6 100%)"
          glowColor="rgba(20, 184, 166, 0.45)"
          id="slider-fan"
          maxAllowed={100}
        />
      </div>

      {/* Modal: Mandatory Coral Safety Warning (>60% Protection) */}
      {showSafetyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
          onClick={handleCancelSafetyConfirmation}
        >
          <div
            className="card-surface"
            style={{
              width: '100%',
              maxWidth: '430px',
              padding: '1.6rem',
              background: 'rgba(26, 24, 28, 0.96)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.15rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(245, 158, 11, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fbbf24',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Coral Protection Lock
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700 }}>
                  Intensity Request &gt; 60% Capacity
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Operating light intensity above <strong>60%</strong> carries a high risk of coral photo-inhibition, zooxanthellae expulsion (coral bleaching), and thermal stress.
            </p>

            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                padding: '0.75rem 0.9rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                fontSize: '0.74rem',
                color: '#f59e0b',
                lineHeight: 1.45,
              }}
            >
              Automatic schedules are strictly restricted below 60%. Are you sure you want to manually unlock high capacity up to 100%?
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.2rem' }}>
              <button
                type="button"
                onClick={handleCancelSafetyConfirmation}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.75rem', fontWeight: 700, fontSize: '0.82rem' }}
              >
                Keep at 60% Safe Cap
              </button>
              <button
                type="button"
                onClick={handleUnlockSafetyConfirmation}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  background: '#f59e0b',
                  color: '#000000',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                }}
              >
                <Unlock size={14} /> Confirm &amp; Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Save Manual Levels into Schedule or Custom Preset */}
      {showSaveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            zIndex: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="card-surface"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '1.5rem',
              background: 'rgba(24, 24, 28, 0.95)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.1rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CalendarPlus size={18} color="#38bdf8" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Save Light Mix
                </h3>
              </div>
              <button
                onClick={() => setShowSaveModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Current Levels Pill Readout */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.45rem',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#60a5fa' }}>BLUE</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.blue)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#38bdf8' }}>WHITE</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.white)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#c084fc' }}>UV</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.uv)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#2dd4bf' }}>FAN</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(fanSpeed)}%</div>
              </div>
            </div>

            {/* Segmented Tab Controls */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '3px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => setSaveTab('schedule')}
                style={{
                  padding: '0.55rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  background: saveTab === 'schedule' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: saveTab === 'schedule' ? '#ffffff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                Insert into Schedule
              </button>
              <button
                type="button"
                onClick={() => setSaveTab('preset')}
                style={{
                  padding: '0.55rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  background: saveTab === 'preset' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: saveTab === 'preset' ? '#ffffff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                Save as Preset
              </button>
            </div>

            {statusMessage && (
              <div
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                <CheckCircle2 size={15} />
                {statusMessage}
              </div>
            )}

            {/* Tab 1: Save to Schedule Keyframe */}
            {saveTab === 'schedule' && (
              <form onSubmit={handleSaveToSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Target Schedule
                  </label>
                  <select
                    value={selectedScheduleId}
                    onChange={(e) => setSelectedScheduleId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {availableSchedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Keyframe Time (HH:MM)
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Pre-filled with aquarium clock time. If a point exists at this time, it will be updated.
                  </span>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ marginTop: '0.5rem' }}
                >
                  <CalendarPlus size={16} /> Save &amp; Sync Keyframe
                </button>
              </form>
            )}

            {/* Tab 2: Save as Quick Preset */}
            {saveTab === 'preset' && (
              <form onSubmit={handleSaveCustomPreset} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Preset Name
                  </label>
                  <input
                    type="text"
                    value={customPresetName}
                    onChange={(e) => setCustomPresetName(e.target.value)}
                    placeholder="e.g. Moonlight Glow, Evening Chill"
                    required
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ marginTop: '0.5rem' }}
                >
                  <BookmarkPlus size={16} /> Save to Quick Profiles
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
