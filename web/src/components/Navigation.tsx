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
  Wifi,
  WifiOff,
  SunMedium,
} from 'lucide-react';

export function TopHeader() {
  const { isDeviceOnline, isSimulated } = useDeviceMqtt();

  return (
    <header className="top-header">
      <div className="logo-group">
        <div className="logo-icon">
          <SunMedium size={18} />
        </div>
        <div>
          <h1 className="brand-title">REEF CONTROLLER</h1>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isSimulated ? 'Simulation Mode' : 'ESP32 Cloud Link'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div className={`status-badge ${isDeviceOnline ? '' : 'offline'}`}>
          <span className="status-dot" />
          {isDeviceOnline ? (
            <>
              <Wifi size={12} /> ONLINE
            </>
          ) : (
            <>
              <WifiOff size={12} /> OFFLINE
            </>
          )}
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
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive ? 'active' : ''}`}
            id={`nav-${item.label.toLowerCase()}`}
          >
            <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
