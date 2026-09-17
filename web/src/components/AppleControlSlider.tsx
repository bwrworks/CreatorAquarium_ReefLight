'use client';

import React, { useRef } from 'react';

interface AppleControlSliderProps {
  label: string;
  sublabel?: string;
  value: number;
  onChange: (val: number) => void;
  icon: React.ReactNode;
  accentColor: string;
  fillGradient: string;
  glowColor: string;
  id?: string;
  unit?: string;
}

export function AppleControlSlider({
  label,
  sublabel,
  value,
  onChange,
  icon,
  accentColor,
  fillGradient,
  glowColor,
  id,
  unit = '%',
}: AppleControlSliderProps) {
  const roundedVal = Math.round(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div
        style={{
          position: 'relative',
          height: '56px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
        className="apple-control-capsule"
      >
        {/* Glowing Liquid Fill Level (Apple Control Center style) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: `${roundedVal}%`,
            background: fillGradient,
            boxShadow: roundedVal > 0 ? `0 0 18px -2px ${glowColor}` : 'none',
            transition: 'width 0.06s ease-out',
            borderRight: roundedVal > 0 && roundedVal < 100 ? '2px solid rgba(255, 255, 255, 0.45)' : 'none',
          }}
        />

        {/* Content Overlaid Inside the Capsule */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 1.15rem',
            pointerEvents: 'none',
          }}
        >
          {/* Left: Icon + Labels */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: roundedVal > 25 ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: roundedVal > 40 ? '#ffffff' : accentColor,
                transition: 'color 0.15s ease, background 0.15s ease',
                backdropFilter: 'blur(8px)',
              }}
            >
              {icon}
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.015em',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
                }}
              >
                {label}
              </div>
              {sublabel && (
                <div
                  style={{
                    fontSize: '0.68rem',
                    color: roundedVal > 45 ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-muted)',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {sublabel}
                </div>
              )}
            </div>
          </div>

          {/* Right: Big Numeric Readout */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px' }}>
            <span
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#ffffff',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.03em',
                textShadow: '0 1px 4px rgba(0, 0, 0, 0.7)',
              }}
            >
              {roundedVal}
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: roundedVal > 80 ? 'rgba(255, 255, 255, 0.85)' : 'var(--text-secondary)',
              }}
            >
              {unit}
            </span>
          </div>
        </div>

        {/* Native Touch & Mouse Drag Layer (Transparent, perfectly overlaying capsule) */}
        <input
          type="range"
          min="0"
          max="100"
          value={roundedVal}
          onChange={(e) => onChange(Number(e.target.value))}
          id={id}
          aria-label={label}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'ew-resize',
            zIndex: 10,
            margin: 0,
            padding: 0,
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
        />
      </div>

      {/* Quick Micro-Snap Buttons: 0%, 25%, 50%, 75%, 100% */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.35rem' }}>
        {[0, 25, 50, 75, 100].map((step) => {
          const isActive = roundedVal === step;
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(step)}
              style={{
                background: 'none',
                border: 'none',
                color: isActive ? accentColor : 'var(--text-dim)',
                fontSize: '0.66rem',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                padding: '2px 4px',
                transition: 'color 0.15s ease',
              }}
            >
              {step}%
            </button>
          );
        })}
      </div>
    </div>
  );
}
