'use client';

import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { ShieldCheck, Lock, KeyRound, Sparkles } from 'lucide-react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, login } = useAuth();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(false);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const success = login(passcode);
    if (!success) {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem',
        backgroundColor: '#f8fafc',
      }}
    >
      <div
        className="card-surface"
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '2.25rem 1.75rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '12px',
            background: '#09090b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <Lock size={24} />
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem', letterSpacing: '-0.02em' }}>
          Reef Aquarium Controller
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.75rem', lineHeight: 1.4 }}>
          Enter access passcode to connect to the cloud light management interface
        </p>

        <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Passcode"
              id="passcode-input"
              style={{
                width: '100%',
                padding: '0.8rem 1rem',
                fontSize: '1rem',
                textAlign: 'center',
                letterSpacing: '0.25em',
                background: '#ffffff',
                border: error ? '2px solid #dc2626' : '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#09090b',
                outline: 'none',
              }}
              autoFocus
            />
          </div>

          {error && (
            <div style={{ color: '#dc2626', fontSize: '0.78rem', fontWeight: 600 }}>
              Incorrect passcode. Default is reef1234
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            id="unlock-button"
            style={{ padding: '0.75rem' }}
          >
            <KeyRound size={16} /> Unlock Dashboard
          </button>

          <button
            type="button"
            onClick={() => {
              setPasscode('reef1234');
              login('reef1234');
            }}
            className="btn-secondary"
            style={{ fontSize: '0.78rem', color: '#475569' }}
          >
            Use Default (reef1234)
          </button>
        </form>
      </div>
    </div>
  );
}
