'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { TopHeader, BottomNav } from './Navigation';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="app-container">
      <TopHeader />
      <main style={{ flex: 1, padding: '1rem' }}>{children}</main>
      <BottomNav />
    </div>
  );
}
