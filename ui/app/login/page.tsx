'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { apiFetch, getApiBase, setToken } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await apiFetch('/v1/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, display_name: displayName }),
        });
      }
      const tokenResponse = await apiFetch<{ access_token: string }>('/v1/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(tokenResponse.access_token);
      window.dispatchEvent(new Event('rag-auth-changed'));
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-illustration">
        <span className="info-eyebrow">Secure access</span>
        <h2 className="info-title">Sign in to your workspace</h2>
        <p className="info-lead">
          Manage ingestion, monitor sync health, and collaborate with your team across a single retrieval surface. All
          activity is logged for compliance.
        </p>
        <div className="stat-grid" style={{ maxWidth: '320px' }}>
          <div className="stat-card">
            <strong>SSO</strong>
            Entra ID &amp; Okta supported
          </div>
          <div className="stat-card">
            <strong>{getApiBase().replace(/^https?:\/\//, '')}</strong>
            API base
          </div>
        </div>
        <Link href="/landing" className="cta-secondary">
          Back to overview
        </Link>
      </div>

      <div className="auth-card">
        <div className="auth-toggle">
          <button type="button" disabled={mode === 'signin'} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" disabled={mode === 'signup'} onClick={() => setMode('signup')}>
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="display">Display name</label>
              <input
                id="display"
                type="text"
                placeholder="Jane Doe"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Processing…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {error && <p className="status-error">{error}</p>}
        <p className="auth-footer">Having trouble? Reach out to your workspace administrator.</p>
      </div>
    </div>
  );
}
