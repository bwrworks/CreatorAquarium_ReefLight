'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDeviceMqtt } from '../lib/MqttContext';
import {
  LayoutDashboard,
  Sliders,
  Calendar,
  Layers,
  Sparkles,
  Settings,
  SunMedium,
} from 'lucide-react';

export function TopHeader() {
  const { isDeviceOnline, isSimulated, deviceState } = useDeviceMqtt();
  const isManual = deviceState.mode === 'manual';

  return (
    <header className="top-header">
      <div className="logo-group">
        <div className="logo-icon">
          <SunMedium size={18} strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="brand-title">REEF CONTROLLER</h1>
          <div className="brand-subtitle">
            {isSimulated ? 'Simulation' : 'ESP32 Cloud Link'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
        {isManual && (
          <div
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0.22rem 0.55rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              letterSpacing: '0.02em',
            }}
          >
            MANUAL
          </div>
        )}

        <div className={`status-pill ${isDeviceOnline ? '' : 'offline'}`}>
          <span className="status-glow-dot" />
          <span>{isDeviceOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/manual', label: 'Manual', icon: Sliders },
    { href: '/schedules', label: 'Schedules', icon: Layers },
    { href: '/weekly', label: 'Weekly', icon: Calendar },
    { href: '/acclimation', label: 'Acclimate', icon: Sparkles },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="dock-wrapper">
      <nav className="bottom-dock">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`dock-item ${isActive ? 'active' : ''}`}
              id={`nav-${item.label.toLowerCase()}`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
