'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export interface UserProfile {
  id: string;
  email: string;
  display_name?: string | null;
}

interface NavBarProps {
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

export default function NavBar({ userProfile, isAuthenticated, onSignIn }: NavBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = () => {
    localStorage.removeItem('auth_token');
    window.dispatchEvent(new Event('rag-auth-changed'));
    router.push('/');
  };

  const navItems = [
    { href: '/landing', label: 'Overview', description: 'Product tour' },
    { href: '/', label: 'Workspace', description: 'Chat & search' },
    { href: '/docs', label: 'Documentation', description: 'Developer hub' },
    { href: '/integrations', label: 'Integrations', description: 'Connect data' },
  ];

  return (
    <nav className="nav-bar">
      <div className="nav-inner">
        <Link href="/landing" className="nav-brand" aria-label="Thinkbox home">
          <span className="nav-logo" aria-hidden="true">
            <Image src="/thinkbox-logo.svg" alt="Thinkbox" width={32} height={32} priority />
          </span>
          <div className="nav-brand-copy">
            <span className="nav-brand-name">Thinkbox</span>
            <span className="nav-brand-tagline">Knowledge orchestrated</span>
          </div>
        </Link>

        <div className="nav-links">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="nav-link-label">{item.label}</span>
                <span className="nav-link-caption">{item.description}</span>
              </Link>
            );
          })}
        </div>

        <div className="nav-search">
          <div className="search-container">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder="Search across knowledge..."
              className="nav-search-input"
              aria-label="Global search"
            />
            <kbd className="search-shortcut">⌘K</kbd>
          </div>
        </div>

        <div className="nav-actions">
          {isAuthenticated ? (
            <div className="nav-profile">
              <div className="nav-profile-meta">
                <div className="nav-avatar" aria-hidden="true">
                  {userProfile?.display_name?.[0] || userProfile?.email[0] || 'U'}
                </div>
                <div className="nav-profile-details">
                  <span className="nav-profile-name">{userProfile?.display_name || 'User'}</span>
                  <span className="nav-profile-email">{userProfile?.email}</span>
                </div>
              </div>
              <div className="nav-user-menu">
                <button type="button" className="nav-icon-btn" title="Notifications">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                </button>
                <button type="button" className="nav-icon-btn" title="Settings">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onSignIn}>
              <span aria-hidden="true">🔐</span>
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
