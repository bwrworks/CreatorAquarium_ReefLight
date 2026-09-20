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
  ShieldAlert,
  AlertTriangle,
  Lock,
  Unlock,
  Sliders,
  Calendar,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Channels } from '../lib/types';

interface Preset {
  id: string;
  name: string;
  icon: React.ElementType;
  channels: Channels;
  fan: number;
}

const QUICK_PRESETS: Preset[] = [
  {
    id: 'daylight',
    name: 'Daylight Peak',
    icon: Sun,
    channels: { blue: 85, white: 55, uv: 70 },
    fan: 75,
  },
  {
    id: 'coral_pop',
    name: 'Actinic Pop',
    icon: Sparkles,
    channels: { blue: 95, white: 15, uv: 100 },
    fan: 65,
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    icon: Moon,
    channels: { blue: 8, white: 0, uv: 5 },
    fan: 30,
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
    isSimulated,
    setSimulated,
  } = useDeviceMqtt();

  const isManual = deviceState.mode === 'manual';
  const isMasterOn = deviceState.masterOn ?? true;

  // Local state for smooth real-time control
  const [channels, setChannels] = useState<Channels>({
    blue: deviceState.live.blue,
    white: deviceState.live.white,
    uv: deviceState.live.uv,
  });
  const [fanSpeed, setFanSpeed] = useState<number>(deviceState.live.fan ?? 40);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [remainingTimeStr, setRemainingTimeStr] = useState<string>('');

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
    const hasOverSafe = (preset.channels.blue > 60 || preset.channels.white > 60 || preset.channels.uv > 60);
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

  const displayTime = deviceState.time
    ? new Date(deviceState.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* Offline / Demo Mode Banner */}
      {!isDeviceOnline && !isSimulated && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={16} color="#f59e0b" />
            <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>
              Device offline. Enable interactive demo?
            </span>
          </div>
          <button
            onClick={() => setSimulated(true)}
            className="btn-pill"
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.65rem' }}
          >
            Demo Mode
          </button>
        </div>
      )}

      {/* Hero Control & Mode Status Card */}
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
              {isManual ? 'Manual Control Active' : (deviceState.activeScheduleId === 'natural_reef' ? 'Natural Reef Daylight' : 'Custom Daily Curve')}
            </div>
          </div>

          <button
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

      {/* Live Spectral Power Distribution Visualizer */}
      <SpectrumVisualizer channels={channels} title="Live Spectral Power Distribution" />

      {/* Quick Tactile Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Instant Presets
          </span>
          {isHighCapacityUnlocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>
              <Unlock size={12} />
              <span>Full Range Unlocked</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <Lock size={12} />
              <span>Safe Mode (Max 60%)</span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem' }}>
          {QUICK_PRESETS.map((p) => {
            const Icon = p.icon;
            const isSelected = activePreset === p.id;

            return (
              <button
                key={p.id}
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
              >
                <Icon size={18} strokeWidth={isSelected ? 2.4 : 1.8} />
                <span style={{ fontSize: '0.68rem', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hardware Control Sliders */}
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

      {/* Master Output Toggle Card */}
      <div
        className="card-elevated"
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: isMasterOn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.12)',
              color: isMasterOn ? '#10b981' : '#f43f5e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${isMasterOn ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.25)'}`,
            }}
          >
            <Power size={18} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Master Hardware Output
            </div>
            <div style={{ fontSize: '0.72rem', color: isMasterOn ? '#10b981' : 'var(--text-muted)', fontWeight: 600 }}>
              {isMasterOn ? 'Hardware Emitting' : 'All LEDs Held at 0%'}
            </div>
          </div>
        </div>

        <label className="apple-toggle">
          <input
            type="checkbox"
            checked={isMasterOn}
            onChange={() => publishMaster(!isMasterOn)}
            id="home-master-toggle"
          />
          <span className="apple-toggle-slider" />
        </label>
      </div>

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
