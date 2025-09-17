'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clearToken, getToken } from '../lib/api';

export default function NavBar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(!!getToken());
    const handler = () => setIsAuthenticated(!!getToken());
    window.addEventListener('rag-auth-changed', handler);
    return () => window.removeEventListener('rag-auth-changed', handler);
  }, []);

  const handleLogout = () => {
    clearToken();
    window.dispatchEvent(new Event('rag-auth-changed'));
  };

  return (
    <nav className="nav-bar">
      <div className="nav-links">
        <Link href="/">Workspace</Link>
        <Link href="/docs">API docs</Link>
        {isAuthenticated && <Link href="/integrations">Integrations</Link>}
      </div>
      <div className="nav-actions">
        {isAuthenticated ? (
          <button onClick={handleLogout} className="ghost-button" type="button">
            Sign out
          </button>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
