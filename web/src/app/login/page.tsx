'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, KeyRound, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      if (res.ok) {
        const from = searchParams.get('from') || '/';
        window.location.href = from;
      } else {
        setErrorMsg('Access denied. Incorrect passcode.');
      }
    } catch {
      setErrorMsg('Authentication service unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="••••"
          id="passcode-input"
          required
          style={{
            width: '100%',
            padding: '0.85rem 1rem',
            fontSize: '1.25rem',
            textAlign: 'center',
            letterSpacing: '0.35em',
            background: 'rgba(255, 255, 255, 0.06)',
            border: errorMsg ? '1px solid #f43f5e' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: '#ffffff',
            outline: 'none',
          }}
          autoFocus
        />
      </div>

      {errorMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            color: '#f43f5e',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={14} />
          <span>{errorMsg}</span>
        </div>
      )}

      <button
        type="submit"
        className="btn-primary"
        id="login-submit-btn"
        disabled={loading}
        style={{ padding: '0.8rem', opacity: loading ? 0.7 : 1 }}
      >
        <KeyRound size={16} />
        {loading ? 'Authenticating...' : 'Unlock Fixture'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem',
        backgroundColor: '#000000',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient background glow */}
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(168, 85, 247, 0.08) 40%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="card-surface"
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          borderRadius: 'var(--radius-xl)',
          background: 'rgba(20, 20, 24, 0.75)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #1e1e24 0%, #111115 100%)',
            color: '#f4f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          }}
        >
          <Lock size={24} strokeWidth={2.2} />
        </div>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem', letterSpacing: '-0.02em' }}>
          Reef Light Controller
        </h1>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: 1.4 }}>
          Enter authorized security passcode to access fixture controls
        </p>

        <Suspense fallback={<div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
