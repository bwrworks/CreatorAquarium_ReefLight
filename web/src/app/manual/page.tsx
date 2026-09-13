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
} from 'lucide-react';
import { Channels } from '../../lib/types';

export default function ManualPage() {
  const { deviceState, publishChannels, publishFan, publishMode } = useDeviceMqtt();

  const [channels, setChannels] = useState<Channels>({
    blue: deviceState.live.blue,
    white: deviceState.live.white,
    red: deviceState.live.red,
    uv: deviceState.live.uv,
  });

  const [fanSpeed, setFanSpeed] = useState<number>(deviceState.live.fan || 40);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    setChannels({
      blue: deviceState.live.blue,
      white: deviceState.live.white,
      red: deviceState.live.red,
      uv: deviceState.live.uv,
    });
    setFanSpeed(deviceState.live.fan);
  }, [deviceState.live]);

  const handleSliderChange = (channelKey: keyof Channels, value: number) => {
    const updated = { ...channels, [channelKey]: value };
    setChannels(updated);
    setActivePreset(null);
    publishChannels(updated);
  };

  const handleFanChange = (value: number) => {
    setFanSpeed(value);
    publishFan(value);
  };

  const applyPreset = (name: string, presetChannels: Channels, fan: number) => {
    setActivePreset(name);
    setChannels(presetChannels);
    setFanSpeed(fan);
    publishChannels(presetChannels);
    publishFan(fan);
  };

  const handleRevertAuto = () => {
    publishMode('auto');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Card */}
      <div className="card-surface" style={{ padding: '1.15rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.02em' }}>
            Manual Fixture Control
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Direct PWM control • Reverts to auto after timeout
          </p>
        </div>
        {deviceState.mode === 'manual' && (
          <button
            onClick={handleRevertAuto}
            className="btn-secondary"
            id="revert-auto-btn"
            style={{ fontSize: '0.76rem', padding: '0.45rem 0.8rem' }}
          >
            <RotateCcw size={13} /> Resume Auto
          </button>
        )}
      </div>

      {/* Preset Grid */}
      <div>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
          Quick Lighting Profiles
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
          <button
            onClick={() => applyPreset('coral', { blue: 95, white: 10, red: 0, uv: 95 }, 50)}
            className={`btn-secondary ${activePreset === 'coral' ? 'active' : ''}`}
            style={{
              padding: '0.65rem 0.4rem',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <Sparkles size={17} color={activePreset === 'coral' ? '#ffffff' : '#7c3aed'} />
            <span style={{ fontSize: '0.74rem' }}>Coral Pop</span>
          </button>

          <button
            onClick={() => applyPreset('daylight', { blue: 80, white: 65, red: 25, uv: 70 }, 55)}
            className={`btn-secondary ${activePreset === 'daylight' ? 'active' : ''}`}
            style={{
              padding: '0.65rem 0.4rem',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <Sun size={17} color={activePreset === 'daylight' ? '#ffffff' : '#0284c7'} />
            <span style={{ fontSize: '0.74rem' }}>Daylight</span>
          </button>

          <button
            onClick={() => applyPreset('sunset', { blue: 45, white: 20, red: 75, uv: 30 }, 40)}
            className={`btn-secondary ${activePreset === 'sunset' ? 'active' : ''}`}
            style={{
              padding: '0.65rem 0.4rem',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <Flame size={17} color={activePreset === 'sunset' ? '#ffffff' : '#dc2626'} />
            <span style={{ fontSize: '0.74rem' }}>Sunset</span>
          </button>

          <button
            onClick={() => applyPreset('moon', { blue: 6, white: 0, red: 0, uv: 0 }, 20)}
            className={`btn-secondary ${activePreset === 'moon' ? 'active' : ''}`}
            style={{
              padding: '0.65rem 0.4rem',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <Moon size={17} color={activePreset === 'moon' ? '#ffffff' : '#2563eb'} />
            <span style={{ fontSize: '0.74rem' }}>Moonlight</span>
          </button>

          <button
            onClick={() => applyPreset('inspect', { blue: 100, white: 100, red: 50, uv: 100 }, 75)}
            className={`btn-secondary ${activePreset === 'inspect' ? 'active' : ''}`}
            style={{
              padding: '0.65rem 0.4rem',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <Search size={17} color={activePreset === 'inspect' ? '#ffffff' : '#09090b'} />
            <span style={{ fontSize: '0.74rem' }}>Inspection</span>
          </button>

          <button
            onClick={() => applyPreset('off', { blue: 0, white: 0, red: 0, uv: 0 }, 15)}
            className={`btn-secondary ${activePreset === 'off' ? 'active' : ''}`}
            style={{
              padding: '0.65rem 0.4rem',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <PowerOff size={17} color={activePreset === 'off' ? '#ffffff' : '#64748b'} />
            <span style={{ fontSize: '0.74rem' }}>Lights Off</span>
          </button>
        </div>
      </div>

      {/* 4 LED Channel Sliders */}
      <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
          Individual Color Channels
        </h3>

        {/* Blue Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-blue)' }}>
              Royal Blue (450nm)
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--channel-blue)',
                background: 'var(--channel-blue-bg)',
                border: '1px solid var(--channel-blue-border)',
                padding: '0.15rem 0.55rem',
                borderRadius: '6px',
              }}
            >
              {Math.round(channels.blue)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={channels.blue}
            onChange={(e) => handleSliderChange('blue', Number(e.target.value))}
            className="range-slider"
            id="slider-blue"
          />
        </div>

        {/* White Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-white)' }}>
              Day White (6500K)
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--channel-white)',
                background: 'var(--channel-white-bg)',
                border: '1px solid var(--channel-white-border)',
                padding: '0.15rem 0.55rem',
                borderRadius: '6px',
              }}
            >
              {Math.round(channels.white)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={channels.white}
            onChange={(e) => handleSliderChange('white', Number(e.target.value))}
            className="range-slider"
            id="slider-white"
          />
        </div>

        {/* Red Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-red)' }}>
              Deep Red (660nm)
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--channel-red)',
                background: 'var(--channel-red-bg)',
                border: '1px solid var(--channel-red-border)',
                padding: '0.15rem 0.55rem',
                borderRadius: '6px',
              }}
            >
              {Math.round(channels.red)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={channels.red}
            onChange={(e) => handleSliderChange('red', Number(e.target.value))}
            className="range-slider"
            id="slider-red"
          />
        </div>

        {/* UV Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--channel-uv)' }}>
              Actinic UV (405nm)
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--channel-uv)',
                background: 'var(--channel-uv-bg)',
                border: '1px solid var(--channel-uv-border)',
                padding: '0.15rem 0.55rem',
                borderRadius: '6px',
              }}
            >
              {Math.round(channels.uv)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={channels.uv}
            onChange={(e) => handleSliderChange('uv', Number(e.target.value))}
            className="range-slider"
            id="slider-uv"
          />
        </div>
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
    </div>
  );
}
