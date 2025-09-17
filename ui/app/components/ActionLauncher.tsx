'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';

import { apiFetch, apiUpload } from '../lib/api';

interface SharePointPayload {
  name: string;
  integration_type: string;
  config: Record<string, unknown>;
}

interface IntegrationResponse {
  id: string;
  name: string;
  integration_type: string;
  status: string;
  config: Record<string, unknown>;
  connection_message?: string;
}

interface UploadResult {
  documentId: string;
  taskId: string;
  filename: string;
}

interface Props {
  userId: string | null;
  principals: string[];
  onDocumentUploaded: (result: UploadResult) => void;
  onError: (message: string) => void;
  onIntegrationSaved?: (integration: IntegrationResponse) => void;
}

export default function ActionLauncher({
  userId,
  principals,
  onDocumentUploaded,
  onError,
  onIntegrationSaved,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [sharepointOpen, setSharepointOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [sharepointForm, setSharepointForm] = useState({
    name: 'SharePoint',
    tenant_id: '',
    client_id: '',
    client_secret: '',
    site_ids: '',
  });
  const [sharepointStatus, setSharepointStatus] = useState<'available' | 'live' | 'unreachable' | 'syncing'>('available');
  const [sharepointMessage, setSharepointMessage] = useState<string>('Connect your Microsoft 365 tenant');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClickAway = (event: MouseEvent) => {
      if (!menuContainerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setConnectorsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setConnectorsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!sharepointOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSharepointOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sharepointOpen]);

  useEffect(() => {
    if (!sharepointOpen || !userId) {
      return;
    }
    (async () => {
      try {
        const integrations = await apiFetch<IntegrationResponse[]>('/v1/integrations');
        const existing = integrations.find((item) => item.integration_type === 'sharepoint');
        if (existing) {
          const cfg = existing.config as Record<string, string | string[]>;
          setSharepointForm({
            name: existing.name,
            tenant_id: String(cfg.tenant_id ?? ''),
            client_id: String(cfg.client_id ?? ''),
            client_secret: String(cfg.client_secret ?? ''),
            site_ids: Array.isArray(cfg.site_ids) ? cfg.site_ids.join(',') : String(cfg.site_ids ?? ''),
          });
          setSharepointStatus((existing.status as typeof sharepointStatus) || 'available');
          setSharepointMessage(existing.connection_message || 'Connection ready');
        } else {
          setSharepointForm({
            name: 'SharePoint',
            tenant_id: '',
            client_id: '',
            client_secret: '',
            site_ids: '',
          });
          setSharepointStatus('available');
          setSharepointMessage('Connect your Microsoft 365 tenant');
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to load integrations');
      }
    })();
  }, [sharepointOpen, userId, onError]);

  const closeMenus = () => {
    setMenuOpen(false);
    setConnectorsOpen(false);
  };

  const handleUploadClick = () => {
    if (!userId) {
      onError('Sign in to upload documents.');
      closeMenus();
      return;
    }
    closeMenus();
    fileInputRef.current?.click();
  };

  const handleOpenSharepoint = () => {
    if (!userId) {
      onError('Sign in to configure integrations.');
      closeMenus();
      return;
    }
    closeMenus();
    setSharepointOpen(true);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const normaliseError = (error: unknown): string => {
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed && typeof parsed.detail === 'string') {
            return parsed.detail;
          }
        } catch (parseError) {
          // fall back to raw message
        }
        return error.message;
      }
      return 'Failed to upload file';
    };

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'manual-upload');
      formData.append('metadata', JSON.stringify({ uploaded_by: userId, filename: file.name }));
      formData.append('allowed_principals', JSON.stringify(principals.length > 0 ? principals : ['public']));
      const response = await apiUpload<{ document_id: string; task_id: string; status: string }>(
        '/v1/documents/upload',
        formData,
      );
      onDocumentUploaded({
        documentId: response.document_id,
        taskId: response.task_id,
        filename: file.name,
      });
    } catch (err) {
      onError(normaliseError(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSharepointClose = () => {
    setSharepointOpen(false);
  };

  const handleSharepointSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) {
      onError('Sign in to configure integrations.');
      return;
    }

    setSavingIntegration(true);
    try {
      const payload: SharePointPayload = {
        name: sharepointForm.name,
        integration_type: 'sharepoint',
        config: {
          tenant_id: sharepointForm.tenant_id.trim(),
          client_id: sharepointForm.client_id.trim(),
          client_secret: sharepointForm.client_secret.trim(),
          site_ids: sharepointForm.site_ids
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        },
      };

      const existing = await apiFetch<IntegrationResponse[]>('/v1/integrations');
      const current = existing.find((item) => item.integration_type === 'sharepoint');
      let integration: IntegrationResponse;
      if (current) {
        integration = await apiFetch<IntegrationResponse>(`/v1/integrations/${current.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        integration = await apiFetch<IntegrationResponse>('/v1/integrations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      const tested = await apiFetch<IntegrationResponse>(`/v1/integrations/${integration.id}/test`, {
        method: 'POST',
      });

      setSharepointStatus((tested.status as typeof sharepointStatus) || 'available');
      setSharepointMessage(tested.connection_message || 'Connection successful');
      if (onIntegrationSaved) {
        onIntegrationSaved(tested);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to configure SharePoint');
    } finally {
      setSavingIntegration(false);
    }
  };
  return (
    <>
      <div className="action-launcher" ref={menuContainerRef}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.ppt,.pptx,.json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="launcher-trigger"
          onClick={() =>
            setMenuOpen((prev) => {
              const next = !prev;
              if (!next) {
                setConnectorsOpen(false);
              }
              return next;
            })
          }
          disabled={uploading}
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <span aria-hidden="true">+</span>
          <span className="sr-only">Open quick actions</span>
        </button>

        {menuOpen && (
          <div className="launcher-menu" role="menu">
            <div className="launcher-header">
              <span className="launcher-label">Bring context</span>
              <p className="launcher-helper">Attach files or connect data sources to this workspace.</p>
            </div>

            <button type="button" className="launcher-item" onClick={handleUploadClick} disabled={uploading} role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">📎</span>
              <span className="launcher-item-text">
                <span className="launcher-item-title">Add photos & files</span>
                <span className="launcher-item-sub">
                  {uploading ? 'Uploading…' : 'Upload documents to your RAG knowledge base'}
                </span>
              </span>
            </button>

            <button type="button" className="launcher-item" onClick={handleOpenSharepoint} role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">🗂️</span>
              <span className="launcher-item-text">
                <span className="launcher-item-title">Add from SharePoint</span>
                <span className="launcher-item-sub">Sync document libraries from Microsoft 365</span>
              </span>
            </button>

            <div className="launcher-divider" />

            <button type="button" className="launcher-item" disabled role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">🧠</span>
              <span className="launcher-item-text">
                <span className="launcher-item-title">Deep research</span>
                <span className="launcher-item-sub">Coming soon</span>
              </span>
            </button>

            <button type="button" className="launcher-item" disabled role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">🎨</span>
              <span className="launcher-item-text">
                <span className="launcher-item-title">Create image</span>
                <span className="launcher-item-sub">Generate visuals from prompts</span>
              </span>
            </button>

            <button type="button" className="launcher-item" disabled role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">🤖</span>
              <span className="launcher-item-text">
                <span className="launcher-item-title">Agent mode</span>
                <span className="launcher-item-sub">Automate workflows with custom agents</span>
              </span>
            </button>

            <div className={`launcher-submenu-container ${connectorsOpen ? 'open' : ''}`}>
              <button
                type="button"
                className={`launcher-item launcher-item--submenu ${connectorsOpen ? 'open' : ''}`}
                onClick={() => setConnectorsOpen((prev) => !prev)}
                aria-haspopup="true"
                aria-expanded={connectorsOpen}
                role="menuitem"
              >
                <span className="launcher-item-icon" aria-hidden="true">🔌</span>
                <span className="launcher-item-text">
                  <span className="launcher-item-title">Use connectors</span>
                  <span className="launcher-item-sub">Connect cloud drives and knowledge apps</span>
                </span>
                <span className="launcher-chevron" aria-hidden="true">›</span>
              </button>

              {connectorsOpen && (
                <div className="launcher-submenu" role="menu">
                  <button type="button" className="launcher-submenu-item" disabled>
                    <span className="launcher-item-icon" aria-hidden="true">📄</span>
                    <span className="launcher-item-text">
                      <span className="launcher-item-title">Connect Google Drive</span>
                      <span className="launcher-item-sub">Coming soon</span>
                    </span>
                  </button>
                  <button type="button" className="launcher-submenu-item" disabled>
                    <span className="launcher-item-icon" aria-hidden="true">☁️</span>
                    <span className="launcher-item-text">
                      <span className="launcher-item-title">Connect OneDrive</span>
                      <span className="launcher-item-sub">Coming soon</span>
                    </span>
                  </button>
                  <button type="button" className="launcher-submenu-item" disabled>
                    <span className="launcher-item-icon" aria-hidden="true">📚</span>
                    <span className="launcher-item-text">
                      <span className="launcher-item-title">Connect Confluence</span>
                      <span className="launcher-item-sub">Coming soon</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {sharepointOpen && (
        <div className="modal-backdrop" role="presentation" onClick={handleSharepointClose}>
          <div
            className="modal sharepoint-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sharepoint-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div className="modal-title">
                <span className="modal-icon" aria-hidden="true">🗂️</span>
                <div>
                  <h2 id="sharepoint-modal-title">Connect SharePoint</h2>
                  <p className="modal-subtitle">Authenticate your Microsoft 365 tenant to sync sites into RAG.</p>
                </div>
              </div>
              <button type="button" className="ghost-button" onClick={handleSharepointClose}>
                Close
              </button>
            </header>

            <section className="modal-status">
              <span className={`status-dot status-${sharepointStatus}`} />
              <div>
                <strong>
                  {sharepointStatus === 'live'
                    ? 'Live connection'
                    : sharepointStatus === 'syncing'
                    ? 'Sync in progress'
                    : sharepointStatus === 'unreachable'
                    ? 'Connection failed'
                    : 'Ready to connect'}
                </strong>
                <p>{sharepointMessage}</p>
              </div>
            </section>

            <form onSubmit={handleSharepointSubmit} className="modal-form">
              <div className="modal-grid">
                <div className="form-row">
                  <label htmlFor="sharepoint-tenant">Tenant ID</label>
                  <input
                    id="sharepoint-tenant"
                    value={sharepointForm.tenant_id}
                    onChange={(event) => setSharepointForm((prev) => ({ ...prev, tenant_id: event.target.value }))}
                    placeholder="contoso.onmicrosoft.com"
                    required
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="sharepoint-client">Client ID</label>
                  <input
                    id="sharepoint-client"
                    value={sharepointForm.client_id}
                    onChange={(event) => setSharepointForm((prev) => ({ ...prev, client_id: event.target.value }))}
                    placeholder="Azure app registration client ID"
                    required
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="sharepoint-secret">Client secret</label>
                  <input
                    id="sharepoint-secret"
                    value={sharepointForm.client_secret}
                    onChange={(event) => setSharepointForm((prev) => ({ ...prev, client_secret: event.target.value }))}
                    placeholder="Stored securely"
                    required
                  />
                </div>
                <div className="form-row form-row--full">
                  <label htmlFor="sharepoint-sites">Site IDs</label>
                  <textarea
                    id="sharepoint-sites"
                    placeholder="Comma-separated site IDs"
                    value={sharepointForm.site_ids}
                    onChange={(event) => setSharepointForm((prev) => ({ ...prev, site_ids: event.target.value }))}
                  />
                </div>
              </div>

              <div className="modal-hint">
                Need help? Provide the tenant and application credentials created in the Microsoft Entra admin center.
              </div>

              <div className="modal-actions">
                <button type="submit" disabled={savingIntegration}>
                  {savingIntegration ? 'Testing connection…' : 'Save & test connection'}
                </button>
                <button type="button" className="ghost-button" onClick={handleSharepointClose}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
