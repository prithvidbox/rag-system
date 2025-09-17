'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import NavBar, { type UserProfile } from '../components/NavBar';
import { apiFetch, getToken } from '../lib/api';

const FEATURES = [
  {
    title: 'Policy-aware retrieval',
    description: 'Respect entitlements across tenants. Principals cascade from document ingest to every chat request.',
  },
  {
    title: 'Hybrid ingestion',
    description: 'Upload files manually or stream from SharePoint and upcoming connectors with incremental syncs.',
  },
  {
    title: 'Observability built-in',
    description: 'Track ingestion progress, token usage, and answer quality from a single enterprise dashboard.',
  },
];

const HIGHLIGHTS = [
  {
    metric: '15 min',
    label: 'from upload to first answer',
  },
  {
    metric: '99.9%',
    label: 'uptime across regions',
  },
  {
    metric: 'SOC 2',
    label: 'controls mapped to every request',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsAuthenticated(false);
      setUserProfile(null);
      return;
    }

    setIsAuthenticated(true);
    apiFetch<UserProfile>('/v1/auth/me')
      .then(setUserProfile)
      .catch(() => {
        setIsAuthenticated(false);
        setUserProfile(null);
      });
  }, []);

  const handleSignIn = () => {
    router.push('/login');
  };

  return (
    <div className="app-wrapper">
      <NavBar userProfile={userProfile} isAuthenticated={isAuthenticated} onSignIn={handleSignIn} />
      <div className="app-content">
        <div className="landing-shell">
          <section className="landing-left">
            <div className="landing-hero-block">
              <span className="info-eyebrow">RAG Enterprise</span>
              <h1>The knowledge command centre for regulated teams</h1>
              <p className="info-lead">
                Ingest confidential documents, enforce access controls, and generate answers you can audit. RAG Enterprise
                unifies chat, search, and ingestion in a single, permission-aware workspace.
              </p>
              <div className="info-actions">
                <Link href="/login" className="cta-primary">
                  Launch workspace
                </Link>
                <Link href="/docs" className="cta-secondary">
                  Review the API
                </Link>
              </div>
            </div>

            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="feature-card">
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-right">
            <div className="landing-highlights">
              <div className="stat-grid">
                {HIGHLIGHTS.map((item) => (
                  <div key={item.label} className="stat-card">
                    <strong>{item.metric}</strong>
                    {item.label}
                  </div>
                ))}
              </div>
              <p className="text-sm text-text-tertiary">
                “RAG Enterprise is the fastest way to operationalise Retrieval-Augmented Generation without compromising on
                compliance or developer agility.”
              </p>
            </div>

            <article className="info-card" style={{ alignItems: 'flex-start' }}>
              <h3>Already onboarded?</h3>
              <p>Jump straight into the workspace and continue the conversation with your organisation’s knowledge.</p>
              <Link href="/" className="cta-secondary">
                Open the workspace →
              </Link>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}
