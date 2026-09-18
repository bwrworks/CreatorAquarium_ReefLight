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
  maxAllowed?: number; // Safe ceiling (e.g. 60 unless unlocked)
  safetyThreshold?: number; // Marker at e.g. 60% for coral safety boundary
  onRequestUnlock?: (attemptedVal: number) => void;
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
  maxAllowed = 100,
  safetyThreshold = 60,
  onRequestUnlock,
}: AppleControlSliderProps) {
  const roundedVal = Math.max(0, Math.min(100, Math.round(value)));
  const capsuleRef = useRef<HTMLDivElement>(null);

  // Gesture Disambiguation & Touch Scroll Bypass
  const isDraggingRef = useRef<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gestureState = useRef<'idle' | 'pending' | 'scrolling' | 'dragging'>('idle');

  const calculatePctFromPointer = useCallback((clientX: number): number => {
    if (!capsuleRef.current) return roundedVal;
    const rect = capsuleRef.current.getBoundingClientRect();
    if (rect.width <= 0) return roundedVal;
    const relativeX = clientX - rect.left;
    const pct = (relativeX / rect.width) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, [roundedVal]);

  const applyValue = useCallback((pct: number) => {
    if (maxAllowed !== undefined && pct > maxAllowed) {
      onChange(maxAllowed);
      onRequestUnlock?.(pct);
    } else {
      onChange(pct);
    }
  }, [maxAllowed, onChange, onRequestUnlock]);

  const applyEndValue = useCallback((pct: number) => {
    if (maxAllowed !== undefined && pct > maxAllowed) {
      onDragEnd?.(maxAllowed);
    } else {
      onDragEnd?.(pct);
    }
  }, [maxAllowed, onDragEnd]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only primary button/touch

    touchStartPos.current = { x: e.clientX, y: e.clientY };

    if (e.pointerType === 'mouse') {
      // Desktop mouse: engage immediately
      gestureState.current = 'dragging';
      isDraggingRef.current = true;
      setIsDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      onDragStart?.();
      const pct = calculatePctFromPointer(e.clientX);
      applyValue(pct);
    } else {
      // Mobile touch: set to 'pending' to disambiguate vertical scroll vs horizontal drag
      gestureState.current = 'pending';
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureState.current === 'scrolling') {
      // User is scrolling the page vertically; ignore all slider movements
      return;
    }

    if (gestureState.current === 'pending') {
      const dx = Math.abs(e.clientX - touchStartPos.current.x);
      const dy = Math.abs(e.clientY - touchStartPos.current.y);

      // If vertical movement occurs (>3px), immediately lock to page scroll
      if (dy > 3) {
        gestureState.current = 'scrolling';
        return;
      }

      // Only engage slider if user moves horizontally by >=20px with clear horizontal intent
      if (dx >= 20 && dx > dy * 3.0) {
        gestureState.current = 'dragging';
        isDraggingRef.current = true;
        setIsDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        onDragStart?.();
        const pct = calculatePctFromPointer(e.clientX);
        applyValue(pct);
      }
      return;
    }

    if (gestureState.current === 'dragging') {
      const pct = calculatePctFromPointer(e.clientX);
      applyValue(pct);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureState.current === 'dragging') {
      isDraggingRef.current = false;
      setIsDragging(false);
      gestureState.current = 'idle';
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      const finalPct = calculatePctFromPointer(e.clientX);
      applyValue(finalPct);
      applyEndValue(finalPct);
      return;
    }

    // Touch tap protection: do NOT jump the slider on stationary touch taps
    // (Mobile users tap the micro-snap buttons directly below to set exact values)
    gestureState.current = 'idle';
  };

  const handlePointerCancel = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    gestureState.current = 'idle';
  };

  const handleSnapClick = (step: number) => {
    if (maxAllowed !== undefined && step > maxAllowed) {
      onChange(maxAllowed);
      onDragEnd?.(maxAllowed);
      onRequestUnlock?.(step);
    } else {
      onChange(step);
      onDragEnd?.(step);
    }
  };

  const isOverSafeLimit = safetyThreshold !== undefined && roundedVal > safetyThreshold;

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
            : isOverSafeLimit
            ? '1px solid rgba(245, 158, 11, 0.35)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: isDragging
            ? `inset 0 1px 3px rgba(0, 0, 0, 0.6), 0 0 16px -2px ${glowColor}`
            : isOverSafeLimit
            ? 'inset 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 12px -3px rgba(245, 158, 11, 0.25)'
            : 'inset 0 1px 3px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'pan-y', // Critical: allows vertical page scroll without slider interference
          cursor: 'ew-resize',
          transition: isDragging
            ? 'none'
            : 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
        }}
      >
        {/* Coral Caution Background Zone (>60%) */}
        {safetyThreshold !== undefined && (
          <div
            style={{
              position: 'absolute',
              left: `${safetyThreshold}%`,
              right: 0,
              top: 0,
              bottom: 0,
              background: 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.03), rgba(245, 158, 11, 0.03) 6px, transparent 6px, transparent 12px)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
        )}

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
            zIndex: 2,
          }}
        />

        {/* Subtle Coral Safety Limit Demarcation Line at 60% */}
        {safetyThreshold !== undefined && (
          <div
            style={{
              position: 'absolute',
              left: `${safetyThreshold}%`,
              top: 0,
              bottom: 0,
              width: '1.5px',
              background: 'rgba(245, 158, 11, 0.5)',
              boxShadow: '0 0 6px rgba(245, 158, 11, 0.6)',
              zIndex: 3,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Content Overlaid Inside Capsule */}
        <div
          style={{
            position: 'relative',
            zIndex: 4,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '-0.015em',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.7)',
                  }}
                >
                  {label}
                </span>
                {isOverSafeLimit && (
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      color: '#fbbf24',
                      background: 'rgba(245, 158, 11, 0.25)',
                      padding: '0.1rem 0.35rem',
                      borderRadius: '4px',
                      letterSpacing: '0.02em',
                    }}
                  >
                    &gt;60%
                  </span>
                )}
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
                color: isOverSafeLimit ? '#fbbf24' : '#ffffff',
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
                color: isOverSafeLimit ? '#fbbf24' : roundedVal > 80 ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-secondary)',
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
            applyValue(val);
            applyEndValue(val);
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
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Quick Micro-Snap Buttons with 60% Coral Safety Cap Marker */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.35rem' }}>
        {[0, 20, 40, 60, 80, 100].map((step) => {
          const isActive = roundedVal === step;
          const isSafetyPoint = step === 60;
          const isAboveSafe = step > 60;

          return (
            <button
              key={step}
              type="button"
              onClick={() => handleSnapClick(step)}
              style={{
                background: isSafetyPoint && !isActive ? 'rgba(245, 158, 11, 0.08)' : 'none',
                border: isSafetyPoint && !isActive ? '1px dashed rgba(245, 158, 11, 0.35)' : 'none',
                color: isActive
                  ? accentColor
                  : isSafetyPoint
                  ? '#f59e0b'
                  : isAboveSafe
                  ? 'rgba(245, 158, 11, 0.7)'
                  : 'var(--text-dim)',
                fontSize: '0.66rem',
                fontWeight: isActive || isSafetyPoint ? 800 : 600,
                cursor: 'pointer',
                padding: '2px 5px',
                borderRadius: '4px',
                transition: 'color 0.15s ease, background 0.15s ease',
              }}
              title={isSafetyPoint ? 'Maximum Recommended Safe Coral Capacity (60%)' : undefined}
            >
              {step}%{isSafetyPoint ? ' ★' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
