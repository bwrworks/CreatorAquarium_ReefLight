'use client';

import React, { useState } from 'react';
import { Channels } from '../lib/types';
import { Activity, Info, Eye, Layers } from 'lucide-react';
import Image from 'next/image';

interface SpectrumVisualizerProps {
  channels: Channels;
  title?: string;
}

export function SpectrumVisualizer({ channels, title = 'Live Spectral Power Distribution' }: SpectrumVisualizerProps) {
  const [viewReference, setViewReference] = useState(false);

  // Generate dynamic spectrum curve based on channel inputs
  // Wavelength range: 390nm to 700nm
  const width = 600;
  const height = 180;

  // Gaussian helper to compute spectral curve intensity at wavelength wl (nm)
  const getIntensity = (wl: number) => {
    // UV peak at 405nm, FWHM ~ 20nm
    const uvContrib = (channels.uv / 100) * Math.exp(-Math.pow((wl - 405) / 14, 2)) * 85;
    // Royal Blue peak at 450nm, FWHM ~ 25nm
    const blueContrib = (channels.blue / 100) * Math.exp(-Math.pow((wl - 450) / 18, 2)) * 100;
    // White: small blue pump at 450nm + broad phosphor hump at 560nm
    const whiteBlue = (channels.white / 100) * Math.exp(-Math.pow((wl - 450) / 22, 2)) * 40;
    const whitePhosphor = (channels.white / 100) * Math.exp(-Math.pow((wl - 565) / 55, 2)) * 55;
    // Red peak at 660nm, FWHM ~ 20nm
    const redContrib = (channels.red / 100) * Math.exp(-Math.pow((wl - 660) / 16, 2)) * 75;

    const total = uvContrib + blueContrib + whiteBlue + whitePhosphor + redContrib;
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
    <div className="card-surface" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b', border: '1px solid #e2e8f0' }}>
            <Activity size={17} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#09090b', letterSpacing: '-0.01em' }}>
              {title}
            </h3>
            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
              Photosynthetically Active Radiation (400nm – 700nm PAR)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setViewReference(!viewReference)}
          className="btn-secondary"
          style={{ fontSize: '0.74rem', padding: '0.35rem 0.65rem' }}
        >
          {viewReference ? <Layers size={13} /> : <Eye size={13} />}
          {viewReference ? 'Live Curve' : 'Lab Reference'}
        </button>
      </div>

      {viewReference ? (
        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <img
            src="/spectrum-reference.jpg"
            alt="Reef Aquarium LED Spectral Power Distribution Reference"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          <div style={{ padding: '0.6rem 0.85rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '0.72rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Info size={14} color="#0284c7" />
            <span>Target Coral PAR Profile: High Royal Blue (450nm) + Actinic UV (405nm) for chlorophyll a & zooxanthellae.</span>
          </div>
        </div>
      ) : (
        <div>
          {/* Dynamic Spectrum Curve Chart */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '150px',
              background: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              <defs>
                {/* Visual spectrum gradient for wavelength backdrop */}
                <linearGradient id="spectrumGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.45" />    {/* UV 390-415 */}
                  <stop offset="18%" stopColor="#2563eb" stopOpacity="0.5" />   {/* Royal Blue 450 */}
                  <stop offset="35%" stopColor="#06b6d4" stopOpacity="0.35" />  {/* Cyan 490 */}
                  <stop offset="55%" stopColor="#10b981" stopOpacity="0.25" />  {/* Green 530 */}
                  <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.3" />   {/* Amber 590 */}
                  <stop offset="85%" stopColor="#dc2626" stopOpacity="0.4" />   {/* Deep Red 660 */}
                  <stop offset="100%" stopColor="#991b1b" stopOpacity="0.25" />
                </linearGradient>

                <linearGradient id="curveStrokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7c3aed" />
                  <stop offset="18%" stopColor="#2563eb" />
                  <stop offset="35%" stopColor="#0284c7" />
                  <stop offset="55%" stopColor="#059669" />
                  <stop offset="70%" stopColor="#d97706" />
                  <stop offset="85%" stopColor="#dc2626" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[425, 450, 500, 550, 600, 660].map((nm) => {
                const x = ((nm - 390) / (700 - 390)) * width;
                return (
                  <line
                    key={nm}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2={height}
                    stroke="#f1f5f9"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                );
              })}

              {/* Shaded Area under live curve */}
              <path d={areaD} fill="url(#spectrumGradient)" />

              {/* Primary Spectral Distribution Curve */}
              <path d={pathD} fill="none" stroke="url(#curveStrokeGradient)" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

          {/* Spectrum Color Band & Nanometer Markers */}
          <div style={{ marginTop: '0.5rem' }}>
            <div
              style={{
                height: '8px',
                borderRadius: '4px',
                background: 'linear-gradient(to right, #7c3aed 0%, #2563eb 18%, #06b6d4 35%, #10b981 55%, #f59e0b 70%, #dc2626 85%, #7f1d1d 100%)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#64748b',
                marginTop: '0.35rem',
                padding: '0 2px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span style={{ color: '#7c3aed' }}>405nm (UV)</span>
              <span style={{ color: '#2563eb' }}>450nm (Blue)</span>
              <span style={{ color: '#059669' }}>550nm (White)</span>
              <span style={{ color: '#dc2626' }}>660nm (Red)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
