'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import NavBar, { type UserProfile } from '../components/NavBar';
import { apiFetch, getToken } from '../lib/api';

interface Integration {
  id: string;
  name: string;
  integration_type: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface IntegrationSync {
  id: string;
  status: string;
  message?: string | null;
  created_at: string;
  updated_at: string;
}

const UPCOMING_TOOLS = [
  {
    name: 'Confluence Cloud',
    description: 'Sync knowledge spaces, blogs, and decision pages with granular permissions.',
  },
  {
    name: 'Notion',
    description: 'Import workspace docs, wikis, and databases with live change detection.',
  },
  {
    name: 'Google Drive',
    description: 'Securely index shared drives and folders with access-aware retrieval.',
  },
];

const SHAREPOINT_TYPE = 'sharepoint';

const formatSince = (value: string) => {
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'moments ago';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
};

export default function IntegrationsPage() {
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [syncs, setSyncs] = useState<Record<string, IntegrationSync[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: 'SharePoint',
    tenant_id: '',
    client_id: '',
    client_secret: '',
    site_ids: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsAuthenticated(false);
      setUserProfile(null);
      router.push('/login');
      setLoading(false);
      return;
    }

    setIsAuthenticated(true);

    (async () => {
      try {
        const profile = await apiFetch<UserProfile>('/v1/auth/me');
        setUserProfile(profile);
      } catch (err) {
        setIsAuthenticated(false);
        setUserProfile(null);
        router.push('/login');
        setLoading(false);
        return;
      }

      try {
        const data = await apiFetch<Integration[]>('/v1/integrations');
        setIntegrations(data);
        const results: Record<string, IntegrationSync[]> = {};
        await Promise.all(
          data.map(async (integration) => {
            const history = await apiFetch<IntegrationSync[]>(`/v1/integrations/${integration.id}/sync`);
            results[integration.id] = history;
          })
        );
        setSyncs(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load integrations');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const sharePointIntegration = useMemo(
    () => integrations.find((integration) => integration.integration_type === SHAREPOINT_TYPE) || null,
    [integrations]
  );

  useEffect(() => {
    if (sharePointIntegration) {
      const cfg = sharePointIntegration.config as Record<string, string | string[]>;
      setForm({
        name: sharePointIntegration.name,
        tenant_id: String(cfg.tenant_id ?? ''),
        client_id: String(cfg.client_id ?? ''),
        client_secret: String(cfg.client_secret ?? ''),
        site_ids: Array.isArray(cfg.site_ids) ? cfg.site_ids.join(',') : String(cfg.site_ids ?? ''),
      });
      setEditingId(sharePointIntegration.id);
    }
  }, [sharePointIntegration]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      name: form.name,
      integration_type: SHAREPOINT_TYPE,
      config: {
        tenant_id: form.tenant_id.trim(),
        client_id: form.client_id.trim(),
        client_secret: form.client_secret.trim(),
        site_ids: form.site_ids
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      },
    };

    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/v1/integrations/${editingId}` : '/v1/integrations';
      const integration = await apiFetch<Integration>(url, {
        method,
        body: JSON.stringify(payload),
      });

      setSuccess('Integration saved successfully');
      setIntegrations((prev) => {
        const others = prev.filter((item) => item.id !== integration.id);
        return [...others, integration];
      });
      setEditingId(integration.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save integration');
    }
  };

  const handleSync = async (integration: Integration) => {
    setError(null);
    setSuccess(null);
    try {
      const record = await apiFetch<IntegrationSync>(`/v1/integrations/${integration.id}/sync`, {
        method: 'POST',
      });
      setSuccess('Sync job queued');
      setSyncs((prev) => ({
        ...prev,
        [integration.id]: [record, ...(prev[integration.id] ?? [])],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue sync');
    }
  };

  const historyItems = sharePointIntegration ? syncs[sharePointIntegration.id] ?? [] : [];

  const handleSignIn = () => {
    router.push('/login');
  };

  return (
    <div className="app-wrapper">
      <NavBar userProfile={userProfile} isAuthenticated={isAuthenticated} onSignIn={handleSignIn} />
      <div className="app-content">
        <div className="integration-wrapper">
          <section className="integration-hero">
            <div>
              <span className="info-eyebrow">Integrations</span>
              <h1 className="info-title">Connect enterprise knowledge fabrics</h1>
              <p className="info-lead">
                Centralize structured and unstructured content, then keep everything in sync with our zero-trust ingestion engine.
              </p>
            </div>
            <div className="stat-grid" style={{ maxWidth: '320px' }}>
              <div className="stat-card">
                <strong>{integrations.length}</strong>
                Active connectors
              </div>
              <div className="stat-card">
                <strong>{historyItems.length}</strong>
                Recent sync jobs
              </div>
            </div>
          </section>

          {error && <p className="status-error">{error}</p>}
          {success && <p className="status-success">{success}</p>}

          <div className="integration-layout">
            <article className="integration-card">
              {loading ? (
                <p className="status-running">Loading integrations…</p>
              ) : (
                <>
                  <header>
                    <div>
                      <h2>Microsoft SharePoint</h2>
                      <p>Ingest curated sites, mirror Microsoft Entra permissions, and deliver fresh answers.</p>
                    </div>
                    <span className="badge live">Live</span>
                  </header>

                  <form onSubmit={handleSubmit} className="integration-form">
                    <div className="form-row">
                      <label htmlFor="tenant">Tenant ID</label>
                      <input
                        id="tenant"
                        value={form.tenant_id}
                        onChange={(event) => setForm((prev) => ({ ...prev, tenant_id: event.target.value }))}
                        placeholder="contoso.onmicrosoft.com"
                        required
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="client">Client ID</label>
                      <input
                        id="client"
                        value={form.client_id}
                        onChange={(event) => setForm((prev) => ({ ...prev, client_id: event.target.value }))}
                        placeholder="Azure app registration client ID"
                        required
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="secret">Client Secret</label>
                      <input
                        id="secret"
                        value={form.client_secret}
                        onChange={(event) => setForm((prev) => ({ ...prev, client_secret: event.target.value }))}
                        placeholder="Stored securely"
                        required
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="sites">Site IDs</label>
                      <textarea
                        id="sites"
                        placeholder="Comma separated site IDs"
                        value={form.site_ids}
                        onChange={(event) => setForm((prev) => ({ ...prev, site_ids: event.target.value }))}
                        rows={3}
                      />
                    </div>
                    <div className="info-actions" style={{ marginTop: 'var(--space-2)' }}>
                      <button type="submit" className="btn btn-primary" disabled={loading}>
                        {editingId ? 'Update configuration' : 'Connect SharePoint'}
                      </button>
                      {editingId && sharePointIntegration && (
                        <button type="button" className="btn btn-secondary" onClick={() => handleSync(sharePointIntegration)}>
                          Trigger sync
                        </button>
                      )}
                    </div>
                  </form>

                  <footer className="integration-schedule">
                    <div className="status-indicator status-warning">
                      <div className="status-dot warning" />
                      Incremental sync runs every 15 minutes
                    </div>
                    <div className="status-indicator status-success">
                      <div className="status-dot success" />
                      Permissions mirrored from Microsoft Entra ID
                    </div>
                  </footer>
                </>
              )}
            </article>

            <aside className="integration-aside">
              <section className="integration-aside-card">
                <div className="insights-section-header">
                  <h3>Latest syncs</h3>
                  <Link href="/docs" className="text-sm text-text-tertiary">
                    API reference
                  </Link>
                </div>
                <div className="integration-history">
                  {historyItems.length > 0 ? (
                    historyItems.map((record) => (
                      <div key={record.id} className="integration-history-item">
                        <span>{formatSince(record.created_at)}</span>
                        <span>{record.status}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-text-tertiary">
                      {loading ? 'Sync jobs will appear once data loads.' : 'Sync jobs will appear here once queued.'}
                    </p>
                  )}
                </div>
              </section>

              <section className="integration-aside-card">
                <h3>Upcoming connectors</h3>
                <div className="upcoming-list">
                  {UPCOMING_TOOLS.map((tool) => (
                    <div key={tool.name} className="upcoming-item">
                      <strong>{tool.name}</strong>
                      <p>{tool.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
