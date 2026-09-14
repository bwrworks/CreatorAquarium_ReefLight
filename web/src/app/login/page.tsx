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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          id="passcode-input"
          required
          style={{
            width: '100%',
            padding: '0.8rem 1rem',
            fontSize: '1rem',
            textAlign: 'center',
            letterSpacing: '0.25em',
            background: '#ffffff',
            border: errorMsg ? '2px solid #dc2626' : '1px solid #cbd5e1',
            borderRadius: '8px',
            color: '#09090b',
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
            gap: '0.4rem',
            color: '#dc2626',
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
        style={{ padding: '0.75rem', opacity: loading ? 0.7 : 1 }}
      >
        <KeyRound size={16} />
        {loading ? 'Verifying...' : 'Sign In'}
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
        backgroundColor: '#f8fafc',
      }}
    >
      <div
        className="card-surface"
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '2.5rem 1.75rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: '#09090b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <Lock size={22} />
        </div>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem', letterSpacing: '-0.02em' }}>
          Reef Aquarium Controller
        </h1>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.75rem', lineHeight: 1.4 }}>
          Enter authorized controller passcode to access cloud lighting management
        </p>

        <Suspense fallback={<div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
