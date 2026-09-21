'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDeviceMqtt } from '../lib/MqttContext';
import { SpectrumVisualizer } from '../components/SpectrumVisualizer';
import { AppleControlSlider } from '../components/AppleControlSlider';
import {
  Power,
  RotateCcw,
  Sparkles,
  Sun,
  Moon,
  Fan,
  PowerOff,
  AlertTriangle,
  Lock,
  Unlock,
  Sliders,
  Calendar,
  Clock,
  CheckCircle2,
  Plus,
  Trash2,
  Save,
  Smartphone,
  Check,
} from 'lucide-react';
import { Channels } from '../lib/types';

interface Preset {
  id: string;
  name: string;
  icon?: React.ElementType;
  channels: Channels;
  fan: number;
  isCustom?: boolean;
}

const QUICK_PRESETS: Preset[] = [
  {
    id: 'week_1_peak',
    name: 'Week 1 Peak',
    icon: Sun,
    channels: { blue: 20, white: 12, uv: 6 },
    fan: 40,
  },
  {
    id: 'week_2_peak',
    name: 'Week 2 Peak',
    icon: Sun,
    channels: { blue: 25, white: 15, uv: 8 },
    fan: 45,
  },
  {
    id: 'week_3_peak',
    name: 'Week 3 Peak',
    icon: Sparkles,
    channels: { blue: 30, white: 18, uv: 10 },
    fan: 50,
  },
  {
    id: 'all_off',
    name: 'Lights Off',
    icon: PowerOff,
    channels: { blue: 0, white: 0, uv: 0 },
    fan: 0,
  },
];

export default function HomePage() {
  const {
    deviceState,
    isDeviceOnline,
    publishChannels,
    publishFan,
    publishMode,
    publishMaster,
    publishDisplayBrightness,
  } = useDeviceMqtt();

  const isManual = deviceState.mode === 'manual';

  // Hardware Power states
  const isMasterOn = deviceState.masterOn ?? true;
  const isDisplayOn = (deviceState.displayBrightness ?? 255) > 0;
  const isFanOn = (deviceState.live.fan ?? 0) > 0;

  const lastActiveBrightnessRef = useRef<number>(
    deviceState.displayBrightness && deviceState.displayBrightness > 0 ? deviceState.displayBrightness : 180
  );
  const lastActiveFanRef = useRef<number>(
    deviceState.live.fan && deviceState.live.fan > 0 ? deviceState.live.fan : 25
  );

  useEffect(() => {
    if (deviceState.displayBrightness && deviceState.displayBrightness > 0) {
      lastActiveBrightnessRef.current = deviceState.displayBrightness;
    }
  }, [deviceState.displayBrightness]);

  useEffect(() => {
    if (deviceState.live.fan && deviceState.live.fan > 0) {
      lastActiveFanRef.current = deviceState.live.fan;
    }
  }, [deviceState.live.fan]);

  // Local state for smooth real-time control
  const [channels, setChannels] = useState<Channels>({
    blue: deviceState.live.blue,
    white: deviceState.live.white,
    uv: deviceState.live.uv,
  });
  const [fanSpeed, setFanSpeed] = useState<number>(deviceState.live.fan ?? 0);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [remainingTimeStr, setRemainingTimeStr] = useState<string>('');

  // Custom Presets State
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showSavePresetModal, setShowSavePresetModal] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');

  // Coral Safety Protection (>60% Threshold)
  const [isHighCapacityUnlocked, setIsHighCapacityUnlocked] = useState<boolean>(false);
  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<
    | { type: 'channel'; channel: keyof Channels; value: number }
    | { type: 'preset'; preset: Preset }
    | null
  >(null);

  // Interaction Refs for zero-jitter, non-laggy dragging
  const isInteractingRef = useRef<boolean>(false);
  const interactionGraceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestChannelsRef = useRef<Channels>(channels);
  const latestFanRef = useRef<number>(fanSpeed);
  const lastPublishChannelsTimeRef = useRef<number>(0);
  const lastPublishFanTimeRef = useRef<number>(0);
  const trailingChannelsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const trailingFanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevModeRef = useRef(deviceState.mode);

  useEffect(() => {
    latestChannelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    latestFanRef.current = fanSpeed;
  }, [fanSpeed]);

  // Sync state from ESP32 when not actively dragging
  useEffect(() => {
    if (!isInteractingRef.current || (prevModeRef.current === 'manual' && deviceState.mode === 'auto')) {
      setChannels({
        blue: deviceState.live.blue,
        white: deviceState.live.white,
        uv: deviceState.live.uv,
      });
      setFanSpeed(deviceState.live.fan ?? 40);
    }
    prevModeRef.current = deviceState.mode;
  }, [deviceState.live, deviceState.mode]);

  // Countdown timer for manual override expiry
  useEffect(() => {
    if (deviceState.mode !== 'manual' || !deviceState.manualOverrideExpiresAt) {
      setRemainingTimeStr('');
      return;
    }

    const interval = setInterval(() => {
      const expiry = new Date(deviceState.manualOverrideExpiresAt!).getTime();
      const diff = expiry - Date.now();
      if (diff <= 0) {
        setRemainingTimeStr('Auto-resuming');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setRemainingTimeStr(`${mins}m ${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deviceState.mode, deviceState.manualOverrideExpiresAt]);

  // Load custom presets on mount
  useEffect(() => {
    const loadPresets = async () => {
      try {
        const stored = localStorage.getItem('reef_custom_presets');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCustomPresets(parsed);
          }
        }
      } catch (e) {
        console.error('Error reading localStorage custom presets:', e);
      }

      try {
        const res = await fetch('/api/presets');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setCustomPresets((prev) => {
              const ids = new Set(prev.map((p) => p.id));
              const additions = data.filter((d: any) => !ids.has(d.id));
              const combined = [...prev, ...additions];
              localStorage.setItem('reef_custom_presets', JSON.stringify(combined));
              return combined;
            });
          }
        }
      } catch (e) {
        // network fallback
      }
    };

    loadPresets();
  }, []);

  // Handler: Start dragging slider
  const handleSliderDragStart = () => {
    isInteractingRef.current = true;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);
    if (!isManual) {
      publishMode('manual');
    }
  };

  // Handler: Real-time slider drag change (throttled at ~11Hz)
  const handleSliderChange = (channelKey: keyof Channels, value: number) => {
    isInteractingRef.current = true;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);

    const updated = { ...channels, [channelKey]: value };
    setChannels(updated);
    latestChannelsRef.current = updated;
    setActivePreset(null);

    const now = Date.now();
    if (now - lastPublishChannelsTimeRef.current >= 85) {
      lastPublishChannelsTimeRef.current = now;
      publishChannels(updated);
    }

    if (trailingChannelsTimerRef.current) clearTimeout(trailingChannelsTimerRef.current);
    trailingChannelsTimerRef.current = setTimeout(() => {
      publishChannels(latestChannelsRef.current);
    }, 90);
  };

  // Handler: Release slider
  const handleSliderDragEnd = (channelKey: keyof Channels, finalVal: number) => {
    if (trailingChannelsTimerRef.current) clearTimeout(trailingChannelsTimerRef.current);
    const updated = { ...latestChannelsRef.current, [channelKey]: finalVal };
    setChannels(updated);
    latestChannelsRef.current = updated;
    publishChannels(updated);

    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);
    interactionGraceTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2000);
  };

  // Handler: Fan slider change
  const handleFanChange = (value: number) => {
    isInteractingRef.current = true;
    if (interactionGraceTimerRef.current) clearTimeout(interactionGraceTimerRef.current);

    setFanSpeed(value);
    latestFanRef.current = value;

    const now = Date.now();
    if (now - lastPublishFanTimeRef.current >= 95) {
      lastPublishFanTimeRef.current = now;
      publishFan(value);
    }

    if (trailingFanTimerRef.current) clearTimeout(trailingFanTimerRef.current);
    trailingFanTimerRef.current = setTimeout(() => {
      publishFan(latestFanRef.current);
    }, 100);
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

  // Quick Preset Selection
  const handleSelectPreset = (preset: Preset) => {
    const hasOverSafe =
      preset.channels.blue > 60 || preset.channels.white > 60 || preset.channels.uv > 60;
    if (hasOverSafe && !isHighCapacityUnlocked) {
      setPendingAction({ type: 'preset', preset });
      setShowSafetyModal(true);
      return;
    }

    if (!isManual) {
      publishMode('manual');
    }
    setActivePreset(preset.id);
    setChannels(preset.channels);
    setFanSpeed(preset.fan);
    publishChannels(preset.channels);
    publishFan(preset.fan);
  };

  // Toggle Mode (Auto <-> Manual)
  const handleToggleMode = () => {
    if (isManual) {
      publishMode('auto');
    } else {
      publishMode('manual');
      publishChannels(channels);
    }
  };

  // Power Controls Handlers
  const handleToggleLightPower = () => {
    publishMaster(!isMasterOn);
  };

  const handleToggleDisplayPower = () => {
    if (isDisplayOn) {
      lastActiveBrightnessRef.current = deviceState.displayBrightness || 180;
      publishDisplayBrightness(0);
    } else {
      publishDisplayBrightness(lastActiveBrightnessRef.current || 180);
    }
  };

  const handleToggleFanPower = () => {
    if (isFanOn) {
      lastActiveFanRef.current = fanSpeed > 0 ? fanSpeed : 25;
      publishFan(0);
      setFanSpeed(0);
    } else {
      const targetFan = Math.min(28, lastActiveFanRef.current > 0 ? lastActiveFanRef.current : 25);
      publishFan(targetFan);
      setFanSpeed(targetFan);
    }
  };

  // Custom Preset Handlers
  const handleSaveCustomPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    const newPreset: Preset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      icon: Sparkles,
      channels: {
        blue: Math.round(channels.blue),
        white: Math.round(channels.white),
        uv: Math.round(channels.uv),
      },
      fan: Math.round(fanSpeed),
      isCustom: true,
    };

    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem('reef_custom_presets', JSON.stringify(updated));
    setActivePreset(newPreset.id);
    setNewPresetName('');
    setShowSavePresetModal(false);

    try {
      await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.error('Failed to sync presets to /api/presets', e);
    }
  };

  const handleDeleteCustomPreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    localStorage.setItem('reef_custom_presets', JSON.stringify(updated));
    if (activePreset === id) setActivePreset(null);

    try {
      await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.error('Failed to delete preset from /api/presets', e);
    }
  };

  // Safety Modal Confirm
  const handleConfirmSafetyUnlock = () => {
    setIsHighCapacityUnlocked(true);
    setShowSafetyModal(false);

    if (pendingAction) {
      if (pendingAction.type === 'channel') {
        handleSliderChange(pendingAction.channel, pendingAction.value);
        handleSliderDragEnd(pendingAction.channel, pendingAction.value);
      } else if (pendingAction.type === 'preset') {
        const p = pendingAction.preset;
        if (!isManual) publishMode('manual');
        setActivePreset(p.id);
        setChannels(p.channels);
        setFanSpeed(p.fan);
        publishChannels(p.channels);
        publishFan(p.fan);
      }
      setPendingAction(null);
    }
  };

  const displayBrightnessPct = Math.round(((deviceState.displayBrightness ?? 255) / 255) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* 1. Hero Control & Mode Status Card */}
      <div className="card-elevated" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isManual ? '#f59e0b' : 'var(--channel-white)',
                }}
              >
                {isManual ? 'MANUAL OVERRIDE' : 'AUTONOMOUS SCHEDULE'}
              </span>
              {isManual && remainingTimeStr && (
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  ({remainingTimeStr})
                </span>
              )}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {isManual ? 'Manual Control Active' : (deviceState.activeScheduleId?.startsWith('reef_growth') ? 'Reef Growth Daylight' : (deviceState.activeScheduleId === 'natural_reef' ? 'Natural Reef Daylight' : 'Custom Daily Curve'))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleMode}
            className="btn-secondary"
            style={{
              padding: '0.45rem 0.85rem',
              fontSize: '0.76rem',
              fontWeight: 700,
              gap: '0.4rem',
              borderColor: isManual ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-subtle)',
              color: isManual ? '#f59e0b' : 'var(--text-primary)',
            }}
          >
            {isManual ? <RotateCcw size={14} /> : <Sliders size={14} />}
            <span>{isManual ? 'Resume Auto' : 'Take Manual'}</span>
          </button>
        </div>

        {/* Live Channel Quick Summary Pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          <div
            style={{
              padding: '0.55rem 0.4rem',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--channel-blue)' }}>ROYAL BLUE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.blue)}%</div>
          </div>

          <div
            style={{
              padding: '0.55rem 0.4rem',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--channel-white)' }}>DAY WHITE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.white)}%</div>
          </div>

          <div
            style={{
              padding: '0.55rem 0.4rem',
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--channel-uv)' }}>ACTINIC UV</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.uv)}%</div>
          </div>

          <div
            style={{
              padding: '0.55rem 0.4rem',
              background: 'rgba(20, 184, 166, 0.08)',
              border: '1px solid rgba(20, 184, 166, 0.25)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--channel-fan)' }}>FAN SPEED</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(fanSpeed)}%</div>
          </div>
        </div>
      </div>

      {/* 2. Hardware Power Controls Panel (Lights, Display, Fan) */}
      <div className="card-elevated" style={{ padding: '1rem 1.15rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Hardware Power Controls
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            Independent On/Off Relays
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
          {/* Light Master Power */}
          <button
            type="button"
            onClick={handleToggleLightPower}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.85rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              background: isMasterOn ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-surface)',
              border: `1px solid ${isMasterOn ? 'rgba(56, 189, 248, 0.35)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              textAlign: 'center',
            }}
            id="btn-power-lights"
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isMasterOn ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isMasterOn ? '#38bdf8' : 'var(--text-dim)',
                boxShadow: isMasterOn ? '0 0 14px rgba(56, 189, 248, 0.45)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <Power size={18} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Lights Power
              </div>
              <div style={{ fontSize: '0.66rem', fontWeight: 600, color: isMasterOn ? '#38bdf8' : 'var(--text-dim)', marginTop: '0.1rem' }}>
                {isMasterOn ? 'ON • Emitting' : 'OFF • Standby'}
              </div>
            </div>
          </button>

          {/* Display Backlight Power */}
          <button
            type="button"
            onClick={handleToggleDisplayPower}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.85rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              background: isDisplayOn ? 'rgba(168, 85, 247, 0.12)' : 'var(--bg-surface)',
              border: `1px solid ${isDisplayOn ? 'rgba(168, 85, 247, 0.35)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              textAlign: 'center',
            }}
            id="btn-power-display"
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isDisplayOn ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDisplayOn ? '#a855f7' : 'var(--text-dim)',
                boxShadow: isDisplayOn ? '0 0 14px rgba(168, 85, 247, 0.45)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <Smartphone size={18} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Display Screen
              </div>
              <div style={{ fontSize: '0.66rem', fontWeight: 600, color: isDisplayOn ? '#a855f7' : 'var(--text-dim)', marginTop: '0.1rem' }}>
                {isDisplayOn ? `ON • ${displayBrightnessPct}%` : 'OFF • Sleep'}
              </div>
            </div>
          </button>

          {/* Cooling Fan Power */}
          <button
            type="button"
            onClick={handleToggleFanPower}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.85rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              background: isFanOn ? 'rgba(20, 184, 166, 0.12)' : 'var(--bg-surface)',
              border: `1px solid ${isFanOn ? 'rgba(20, 184, 166, 0.35)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              textAlign: 'center',
            }}
            id="btn-power-fan"
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isFanOn ? 'rgba(20, 184, 166, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isFanOn ? '#14b8a6' : 'var(--text-dim)',
                boxShadow: isFanOn ? '0 0 14px rgba(20, 184, 166, 0.45)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <Fan size={18} strokeWidth={2.2} className={isFanOn ? 'animate-spin-slow' : ''} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Cooling Fan
              </div>
              <div style={{ fontSize: '0.66rem', fontWeight: 600, color: isFanOn ? '#14b8a6' : 'var(--text-dim)', marginTop: '0.1rem' }}>
                {isFanOn ? `ON • ${Math.round(fanSpeed)}%` : 'OFF • Stopped'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Live Spectral Power Distribution Visualizer */}
      <SpectrumVisualizer channels={channels} title="Live Spectral Power Distribution" />

      {/* 4. Tactile Built-in & Custom Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Presets & Spectra
            </span>
            {isHighCapacityUnlocked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>
                <Unlock size={11} />
                <span>Unlocked</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                <Lock size={11} />
                <span>Safe (≤60%)</span>
              </div>
            )}
          </div>

          {/* Save Current as Custom Preset Button */}
          <button
            type="button"
            onClick={() => setShowSavePresetModal(true)}
            className="btn-pill"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              padding: '0.3rem 0.65rem',
              color: 'var(--channel-white)',
              borderColor: 'rgba(56, 189, 248, 0.35)',
              background: 'rgba(56, 189, 248, 0.1)',
            }}
            id="btn-save-current-preset"
          >
            <Plus size={13} strokeWidth={2.4} />
            <span>Save Current</span>
          </button>
        </div>

        {/* Built-in Presets Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem' }}>
          {QUICK_PRESETS.map((p) => {
            const Icon = p.icon || Sun;
            const isSelected = activePreset === p.id;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.65rem 0.35rem',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'var(--bg-surface)',
                  border: `1px solid ${isSelected ? 'rgba(255, 255, 255, 0.3)' : 'var(--border-subtle)'}`,
                  color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                id={`preset-${p.id}`}
              >
                <Icon size={18} strokeWidth={isSelected ? 2.4 : 1.8} />
                <span style={{ fontSize: '0.68rem', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom Saved Presets Section */}
        {customPresets.length > 0 && (
          <div style={{ marginTop: '0.35rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem', paddingLeft: '0.25rem' }}>
              My Custom Presets
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '0.45rem' }}>
              {customPresets.map((p) => {
                const isSelected = activePreset === p.id;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPreset(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.65rem',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.14)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'rgba(56, 189, 248, 0.4)' : 'var(--border-subtle)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                    id={`custom-preset-${p.id}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                      <Sparkles size={14} color={isSelected ? '#38bdf8' : 'var(--text-muted)'} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: isSelected ? '#ffffff' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                          B{p.channels.blue} W{p.channels.white} UV{p.channels.uv} • F{p.fan}%
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustomPreset(p.id, e)}
                      title="Delete preset"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: '0.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        marginLeft: '0.25rem',
                        transition: 'color 0.2s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#f43f5e')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                      id={`del-${p.id}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. Hardware Channel Control Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Hardware Channels
          </span>
          {!isManual && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Slide to override schedule
            </span>
          )}
        </div>

        {/* Royal Blue Slider */}
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

        {/* Day White Slider */}
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
          onRequestUnlock={(requestedVal) => {
            setPendingAction({ type: 'channel', channel: 'white', value: requestedVal });
            setShowSafetyModal(true);
          }}
        />

        {/* Actinic UV Slider */}
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
          onRequestUnlock={(requestedVal) => {
            setPendingAction({ type: 'channel', channel: 'uv', value: requestedVal });
            setShowSafetyModal(true);
          }}
        />

        {/* PWM Cooling Fan Slider */}
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

      {/* Save Custom Preset Modal */}
      {showSavePresetModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.25rem',
          }}
        >
          <div
            className="card-elevated"
            style={{
              maxWidth: '390px',
              width: '100%',
              padding: '1.5rem',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38bdf8',
                }}
              >
                <Save size={18} strokeWidth={2.4} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Save Custom Preset
                </h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Save current slider outputs for instant one-tap recall
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveCustomPreset}>
              {/* Preset Name Input */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  Preset Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Frag Growth, Midnight Glow"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id="input-custom-preset-name"
                />
              </div>

              {/* Channels Snapshot Preview */}
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Captured Configuration
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--channel-blue)', fontWeight: 700 }}>BLUE</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.blue)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--channel-white)', fontWeight: 700 }}>WHITE</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.white)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--channel-uv)', fontWeight: 700 }}>UV</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(channels.uv)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--channel-fan)', fontWeight: 700 }}>FAN</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Math.round(fanSpeed)}%</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowSavePresetModal(false)}
                  className="btn-secondary"
                  style={{ padding: '0.55rem 1rem', fontSize: '0.78rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '0.55rem 1.15rem', fontSize: '0.78rem', width: 'auto' }}
                  id="btn-confirm-save-preset"
                >
                  Save Preset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coral Safety Confirmation Modal (>60% Protection) */}
      {showSafetyModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(16px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            className="card-elevated"
            style={{
              maxWidth: '380px',
              width: '100%',
              padding: '1.5rem',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(245, 158, 11, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={20} strokeWidth={2.4} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f59e0b' }}>
                  Coral Photobleaching Warning
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Intensity &gt; 60% Exceeds Standard Safe PAR
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Intensities above 60% can induce photoinhibition and severe bleaching in sensitive SPS/LPS corals unless properly acclimated. Do you wish to unlock full power for this session?
            </p>

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowSafetyModal(false);
                  setPendingAction(null);
                }}
                className="btn-secondary"
                style={{ flex: 1, padding: '0.65rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSafetyUnlock}
                style={{
                  flex: 1,
                  padding: '0.65rem',
                  background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                  color: '#000000',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                }}
              >
                Unlock &gt;60%
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
