'use client';

import { FormEvent, useState } from 'react';
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
    <main className="card" style={{ maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button type="button" disabled={mode === 'signin'} onClick={() => setMode('signin')}>
          Sign in
        </button>
        <button type="button" disabled={mode === 'signup'} onClick={() => setMode('signup')}>
          Sign up
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        )}
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Processing…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      {error && <p style={{ color: '#f87171', marginTop: '1rem' }}>{error}</p>}
      <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#94a3b8' }}>
        API base: {getApiBase()}
      </p>
    </main>
  );
}
