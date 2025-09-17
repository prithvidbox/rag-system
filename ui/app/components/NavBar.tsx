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
          <input
            type="text"
            placeholder="Search across knowledge..."
            className="nav-search-input"
            aria-label="Global search"
          />
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
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleSignOut}>
                  Sign Out
                </button>
                <button type="button" className="btn btn-ghost btn-sm">
                  Settings
                </button>
                <button type="button" className="btn btn-ghost btn-sm">
                  Help
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
