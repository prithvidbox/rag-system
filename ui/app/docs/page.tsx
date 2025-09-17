'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import NavBar, { type UserProfile } from '../components/NavBar';
import { apiFetch, getApiBase, getToken } from '../lib/api';

interface OpenApiDocument {
  info?: { title?: string; version?: string; description?: string };
}

const SDK_LINKS = [
  { label: 'TypeScript SDK', href: 'https://github.com/' },
  { label: 'Python SDK', href: 'https://github.com/' },
  { label: 'Postman Collection', href: 'https://www.postman.com/' },
];

export default function DocsPage() {
  const router = useRouter();
  const [spec, setSpec] = useState<OpenApiDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const apiBase = getApiBase();

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

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${apiBase}/openapi.json`);
        if (!response.ok) {
          throw new Error('Failed to load OpenAPI spec');
        }
        setSpec(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load docs');
      }
    })();
  }, [apiBase]);

  const handleSignIn = () => {
    router.push('/login');
  };

  return (
    <div className="app-wrapper">
      <NavBar userProfile={userProfile} isAuthenticated={isAuthenticated} onSignIn={handleSignIn} />
      <div className="app-content">
        <div className="docs-shell">
          <div className="docs-column">
            <section className="info-hero">
              <div className="info-eyebrow">Developer Hub</div>
              <h1 className="info-title">RAG Enterprise API</h1>
              <p className="info-lead">
                Build retrieval-augmented workflows that respect enterprise permissions. Authenticate once, then ingest
                documents, poll processing progress, and query the knowledge graph with low-latency responses.
              </p>
              <div className="info-actions">
                <Link href="/login" className="cta-primary">
                  Get an API token
                </Link>
                <a className="cta-secondary" href={`${apiBase}/docs`} target="_blank" rel="noreferrer">
                  View interactive Swagger
                </a>
              </div>
            </section>

            <section className="info-grid">
              <article className="info-card">
                <h3>Authentication</h3>
                <p>Authenticate with the bearer token issued from your workspace settings. Tokens map to role-based scopes.</p>
                <code>Authorization: Bearer &lt;token&gt;</code>
              </article>
              <article className="info-card">
                <h3>Ingestion</h3>
                <p>Upload documents with `POST /v1/documents` then poll `/v1/documents/status/:taskId` until ready.</p>
              </article>
              <article className="info-card">
                <h3>Chat &amp; Retrieval</h3>
                <p>Use `POST /v1/chat` to generate answers. Provide principals to enforce fine-grained access policies.</p>
              </article>
              <article className="info-card">
                <h3>SDK &amp; Tools</h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {SDK_LINKS.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            </section>
          </div>

          <aside className="docs-spec">
            <div className="info-spec-copy">
              <h2>Quick start</h2>
              <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                <li>Generate an API token from the workspace admin settings.</li>
                <li>Upload source material via `/v1/documents` or the UI Action Launcher.</li>
                <li>Poll the ingestion status endpoint until processing is complete.</li>
                <li>Send chat or search requests with the principals the caller is allowed to access.</li>
              </ol>
              <p className="text-sm text-text-tertiary">
                Current specification: {spec?.info?.title ?? 'RAG Enterprise'} v{spec?.info?.version ?? 'latest'}
              </p>
              {error && <p className="status-error">{error}</p>}
            </div>

            <pre>{spec ? JSON.stringify(spec, null, 2) : 'Loading OpenAPI specification…'}</pre>
          </aside>
        </div>
      </div>
    </div>
  );
}
