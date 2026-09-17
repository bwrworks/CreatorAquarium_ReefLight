'use client';

import React, { useRef, useState, useCallback } from 'react';

interface AppleControlSliderProps {
  label: string;
  sublabel?: string;
  value: number;
  onChange: (val: number) => void;
  onDragStart?: () => void;
  onDragEnd?: (val: number) => void;
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
  onDragStart,
  onDragEnd,
  icon,
  accentColor,
  fillGradient,
  glowColor,
  id,
  unit = '%',
}: AppleControlSliderProps) {
  const roundedVal = Math.max(0, Math.min(100, Math.round(value)));
  const capsuleRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const calculatePctFromPointer = useCallback((clientX: number): number => {
    if (!capsuleRef.current) return roundedVal;
    const rect = capsuleRef.current.getBoundingClientRect();
    if (rect.width <= 0) return roundedVal;
    const relativeX = clientX - rect.left;
    const pct = (relativeX / rect.width) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, [roundedVal]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to primary click / single touch
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture unsupported
    }
    isDraggingRef.current = true;
    setIsDragging(true);
    onDragStart?.();
    const pct = calculatePctFromPointer(e.clientX);
    onChange(pct);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const pct = calculatePctFromPointer(e.clientX);
    onChange(pct);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    const finalPct = calculatePctFromPointer(e.clientX);
    onChange(finalPct);
    onDragEnd?.(finalPct);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    onDragEnd?.(roundedVal);
  };

  const handleSnapClick = (step: number) => {
    onChange(step);
    onDragEnd?.(step);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div
        ref={capsuleRef}
        id={id}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="apple-control-capsule"
        style={{
          position: 'relative',
          height: '56px',
          borderRadius: '16px',
          background: isDragging ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
          border: isDragging
            ? `1px solid ${accentColor}66`
            : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: isDragging
            ? `inset 0 1px 3px rgba(0, 0, 0, 0.6), 0 0 16px -2px ${glowColor}`
            : 'inset 0 1px 3px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'none', // Critical: prevents mobile gestures from hijacking drag
          cursor: 'ew-resize',
          transition: isDragging
            ? 'none'
            : 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
        }}
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
            // Transition: NONE while actively dragging for zero lag, smooth spring curve when snapping/idle
            transition: isDragging ? 'none' : 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            borderRight:
              roundedVal > 0 && roundedVal < 100 ? '2px solid rgba(255, 255, 255, 0.55)' : 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Content Overlaid Inside Capsule */}
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
                background: roundedVal > 25 ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: roundedVal > 40 ? '#ffffff' : accentColor,
                transition: isDragging ? 'none' : 'color 0.15s ease, background 0.15s ease',
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
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.7)',
                }}
              >
                {label}
              </div>
              {sublabel && (
                <div
                  style={{
                    fontSize: '0.68rem',
                    color: roundedVal > 45 ? 'rgba(255, 255, 255, 0.85)' : 'var(--text-muted)',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {sublabel}
                </div>
              )}
            </div>
          </div>

          {/* Right: Tabular Numeric Readout */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px' }}>
            <span
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#ffffff',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.03em',
                textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
              }}
            >
              {roundedVal}
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: roundedVal > 80 ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-secondary)',
              }}
            >
              {unit}
            </span>
          </div>
        </div>

        {/* Hidden Accessibility Range Input for Screen Readers & Keyboard Navigation */}
        <input
          type="range"
          min="0"
          max="100"
          value={roundedVal}
          onChange={(e) => {
            const val = Number(e.target.value);
            onChange(val);
            onDragEnd?.(val);
          }}
          aria-label={label}
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            margin: '-1px',
            padding: 0,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            border: 0,
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
              onClick={() => handleSnapClick(step)}
              style={{
                background: 'none',
                border: 'none',
                color: isActive ? accentColor : 'var(--text-dim)',
                fontSize: '0.66rem',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                padding: '3px 6px',
                borderRadius: '4px',
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
