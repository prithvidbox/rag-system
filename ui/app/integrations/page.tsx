'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }

    (async () => {
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

  if (loading) {
    return (
      <main className="integration-wrapper">
        <p className="status-running">Loading integrations…</p>
      </main>
    );
  }

  return (
    <main className="integration-wrapper">
      <section className="integration-hero">
        <div>
          <h1>Integrations</h1>
          <p>Connect enterprise knowledge systems and manage continuous synchronization.</p>
        </div>
      </section>

      {error && <p className="status-error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {success && <p className="status-success" style={{ marginBottom: '1rem' }}>{success}</p>}

      <section className="integration-grid">
        <article className="integration-card">
          <header>
            <div>
              <h2>Microsoft SharePoint</h2>
              <p>Ingest curated sites, enforce Microsoft 365 permissions, and keep documents fresh.</p>
            </div>
            <span className="badge live">Live</span>
          </header>

          <form onSubmit={handleSubmit} className="integration-form">
            <div className="form-row">
              <label>Tenant ID</label>
              <input
                value={form.tenant_id}
                onChange={(event) => setForm((prev) => ({ ...prev, tenant_id: event.target.value }))}
                placeholder="contoso.onmicrosoft.com"
                required
              />
            </div>
            <div className="form-row">
              <label>Client ID</label>
              <input
                value={form.client_id}
                onChange={(event) => setForm((prev) => ({ ...prev, client_id: event.target.value }))}
                placeholder="Azure app registration client ID"
                required
              />
            </div>
            <div className="form-row">
              <label>Client secret</label>
              <input
                value={form.client_secret}
                onChange={(event) => setForm((prev) => ({ ...prev, client_secret: event.target.value }))}
                placeholder="Stored securely"
                required
              />
            </div>
            <div className="form-row">
              <label>Site IDs</label>
              <textarea
                placeholder="Comma-separated site IDs"
                value={form.site_ids}
                onChange={(event) => setForm((prev) => ({ ...prev, site_ids: event.target.value }))}
              />
            </div>
            <div className="form-actions">
              <button type="submit">{editingId ? 'Update configuration' : 'Save integration'}</button>
              {editingId && (
                <button type="button" className="ghost-button" onClick={() => handleSync(sharePointIntegration!)}>
                  Sync now
                </button>
              )}
            </div>
          </form>

          {editingId && (
            <div className="sync-badges">
              <h3>Recent sync activity</h3>
              <div className="sync-list">
                {(syncs[editingId] ?? []).length === 0 ? (
                  <p className="conversation-empty">No sync jobs yet.</p>
                ) : (
                  (syncs[editingId] ?? []).map((record) => (
                    <div key={record.id} className={`sync-row status-${record.status}`}>
                      <div>
                        <strong>{record.status.toUpperCase()}</strong>
                        {record.message && <span className="sync-message">{record.message}</span>}
                      </div>
                      <span>{new Date(record.updated_at).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </article>

        {UPCOMING_TOOLS.map((tool) => (
          <article key={tool.name} className="integration-card upcoming">
            <header>
              <div>
                <h2>{tool.name}</h2>
                <p>{tool.description}</p>
              </div>
              <span className="badge upcoming-badge">Coming soon</span>
            </header>
            <p className="upcoming-hint">Register interest with your customer success manager to accelerate onboarding.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
