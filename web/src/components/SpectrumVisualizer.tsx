'use client';

import React, { useState } from 'react';
import { Channels } from '../lib/types';
import { Activity, Layers, Sparkles } from 'lucide-react';

interface SpectrumVisualizerProps {
  channels: Channels;
  title?: string;
}

export function SpectrumVisualizer({ channels, title = 'Spectral Power Distribution' }: SpectrumVisualizerProps) {
  const [viewReference, setViewReference] = useState(false);

  // Generate dynamic spectrum curve based on channel inputs (390nm to 700nm)
  const width = 600;
  const height = 175;

  // Gaussian spectral curve intensity at wavelength wl (nm)
  const getIntensity = (wl: number) => {
    // UV peak at 405nm (2x Actinic UV)
    const uvContrib = (channels.uv / 100) * Math.exp(-Math.pow((wl - 405) / 14, 2)) * 85;
    // Royal Blue peak at 450nm (10x LEDs: 6x Ch1 + 4x Ch2)
    const blueContrib = (channels.blue / 100) * Math.exp(-Math.pow((wl - 450) / 20, 2)) * 120;
    // White: 4x LEDs (Day White 6500K)
    const whiteBlue = (channels.white / 100) * Math.exp(-Math.pow((wl - 450) / 22, 2)) * 40;
    const whitePhosphor = (channels.white / 100) * Math.exp(-Math.pow((wl - 565) / 55, 2)) * 55;

    const total = uvContrib + blueContrib + whiteBlue + whitePhosphor;
    return Math.min(total, 110);
  };

  // Build SVG path
  let pathD = 'M 0 ' + height;
  let areaD = 'M 0 ' + height;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= 60; i++) {
    const wl = 390 + (i / 60) * (700 - 390);
    const intensity = getIntensity(wl);
    const x = (i / 60) * width;
    const y = height - (intensity / 115) * (height - 24) - 8;
    points.push({ x, y });
    if (i === 0) {
      pathD = `M ${x} ${y}`;
      areaD = `M ${x} ${height} L ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
      areaD += ` L ${x} ${y}`;
    }
  }
  areaD += ` L ${width} ${height} Z`;

  return (
    <div className="card-surface" style={{ padding: '1.2rem' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: 'rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Activity size={16} strokeWidth={2.4} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {title}
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Live PAR Spectrum (400nm – 700nm)
            </span>
          </div>
        </div>

        {/* Segmented Pill Selector */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.06)',
            padding: '2px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            type="button"
            onClick={() => setViewReference(false)}
            style={{
              padding: '0.28rem 0.65rem',
              fontSize: '0.7rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              background: !viewReference ? '#ffffff' : 'transparent',
              color: !viewReference ? '#000000' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Live Mix
          </button>
          <button
            type="button"
            onClick={() => setViewReference(true)}
            style={{
              padding: '0.28rem 0.65rem',
              fontSize: '0.7rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              background: viewReference ? '#ffffff' : 'transparent',
              color: viewReference ? '#000000' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Reference
          </button>
        </div>
      </div>

      {viewReference ? (
        <div
          style={{
            borderRadius: '14px',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            background: '#0a0a0d',
          }}
        >
          <img
            src="/spectrum-reference.jpg"
            alt="Reef Aquarium LED Spectral Reference"
            style={{ width: '100%', height: 'auto', display: 'block', opacity: 0.95 }}
          />
          <div
            style={{
              padding: '0.65rem 0.9rem',
              background: 'rgba(18, 18, 22, 0.9)',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Sparkles size={14} color="#a855f7" />
            <span>Target Coral PAR: High Royal Blue (450nm) + Actinic UV (405nm) for zooxanthellae photosynthesis.</span>
          </div>
        </div>
      ) : (
        <div>
          {/* Laser-Sharp Dynamic Spectrum Display */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '145px',
              background: 'radial-gradient(ellipse at 50% 120%, rgba(37, 99, 235, 0.12) 0%, #050508 70%)',
              borderRadius: '14px',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.8)',
            }}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                <linearGradient id="spectrumGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
                  <stop offset="22%" stopColor="#3b82f6" stopOpacity="0.5" />
                  <stop offset="48%" stopColor="#06b6d4" stopOpacity="0.35" />
                  <stop offset="72%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.2" />
                </linearGradient>

                <linearGradient id="curveStrokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#c084fc" />
                  <stop offset="22%" stopColor="#60a5fa" />
                  <stop offset="48%" stopColor="#38bdf8" />
                  <stop offset="72%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[405, 450, 500, 550, 600].map((nm) => {
                const x = ((nm - 390) / (700 - 390)) * width;
                return (
                  <line
                    key={nm}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2={height}
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                );
              })}

              {/* Shaded Area under live curve */}
              <path d={areaD} fill="url(#spectrumGradient)" />

              {/* Primary Spectral Distribution Curve */}
              <path
                d={pathD}
                fill="none"
                stroke="url(#curveStrokeGradient)"
                strokeWidth="2.8"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))' }}
              />
            </svg>
          </div>

          {/* Glowing Wavelength Band & Minimal Labels */}
          <div style={{ marginTop: '0.65rem' }}>
            <div
              style={{
                height: '5px',
                borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(to right, #a855f7 0%, #3b82f6 24%, #06b6d4 48%, #10b981 72%, #f59e0b 100%)',
                opacity: 0.85,
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.68rem',
                fontWeight: 600,
                marginTop: '0.4rem',
                padding: '0 2px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span style={{ color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#a855f7' }} />
                405nm UV
              </span>
              <span style={{ color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3b82f6' }} />
                450nm Royal Blue
              </span>
              <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#38bdf8' }} />
                6500K Daylight
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
