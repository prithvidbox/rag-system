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
    if (!menuOpen) return;
    
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
    if (!sharepointOpen) return;
    
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSharepointOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sharepointOpen]);

  useEffect(() => {
    if (!sharepointOpen || !userId) return;
    
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
    if (!file) return;

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
          title="Quick actions"
        >
          <span aria-hidden="true">
            {uploading ? '⏳' : '+'}
          </span>
          <span className="sr-only">Open quick actions</span>
        </button>

        {menuOpen && (
          <div className="launcher-menu animate-fade-in" role="menu">
            <div className="launcher-header">
              <span className="launcher-label">Quick Actions</span>
              <p className="launcher-helper">
                Upload documents, connect data sources, or launch AI-powered tools.
              </p>
            </div>

            <button 
              type="button" 
              className="launcher-item" 
              onClick={handleUploadClick} 
              disabled={uploading} 
              role="menuitem"
            >
              <span className="launcher-item-icon" aria-hidden="true">
                📎
              </span>
              <div className="launcher-item-text">
                <div className="launcher-item-title">Upload Documents</div>
                <div className="launcher-item-sub">
                  {uploading ? 'Uploading...' : 'Add files to your knowledge base'}
                </div>
              </div>
            </button>

            <button 
              type="button" 
              className="launcher-item" 
              onClick={handleOpenSharepoint} 
              role="menuitem"
            >
              <span className="launcher-item-icon" aria-hidden="true">
                🗂️
              </span>
              <div className="launcher-item-text">
                <div className="launcher-item-title">SharePoint Integration</div>
                <div className="launcher-item-sub">
                  Sync document libraries from Microsoft 365
                </div>
              </div>
            </button>

            <div className="launcher-divider" />

            <button type="button" className="launcher-item" disabled role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">
                🧠
              </span>
              <div className="launcher-item-text">
                <div className="launcher-item-title">AI Research Assistant</div>
                <div className="launcher-item-sub">Coming soon - Deep research capabilities</div>
              </div>
            </button>

            <button type="button" className="launcher-item" disabled role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">
                🎨
              </span>
              <div className="launcher-item-text">
                <div className="launcher-item-title">Generate Visuals</div>
                <div className="launcher-item-sub">Create images and diagrams from text</div>
              </div>
            </button>

            <button type="button" className="launcher-item" disabled role="menuitem">
              <span className="launcher-item-icon" aria-hidden="true">
                🤖
              </span>
              <div className="launcher-item-text">
                <div className="launcher-item-title">Custom Agents</div>
                <div className="launcher-item-sub">Automate workflows with AI agents</div>
              </div>
            </button>

            <div className="launcher-divider" />

            <button 
              type="button" 
              className="launcher-item" 
              role="menuitem"
            >
              <span className="launcher-item-icon" aria-hidden="true">
                📊
              </span>
              <div className="launcher-item-text">
                <div className="launcher-item-title">Analytics Dashboard</div>
                <div className="launcher-item-sub">View usage insights and trends</div>
              </div>
            </button>

            <button 
              type="button" 
              className="launcher-item" 
              role="menuitem"
            >
              <span className="launcher-item-icon" aria-hidden="true">
                🛠️
              </span>
              <div className="launcher-item-text">
                <div className="launcher-item-title">Request Support</div>
                <div className="launcher-item-sub">Open a support ticket</div>
              </div>
            </button>

            <div className="launcher-divider" />

            <div className="launcher-footnote">
              <div className="launcher-footnote-header">
                <span aria-hidden="true">🔌</span>
                <span className="launcher-footnote-title">More Integrations</span>
              </div>
              <div className="launcher-footnote-list">
                <div>• Google Drive (Coming Soon)</div>
                <div>• OneDrive (Coming Soon)</div>
                <div>• Confluence (Coming Soon)</div>
                <div>• Slack (Coming Soon)</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {sharepointOpen && (
        <div className="modal-backdrop animate-fade-in" role="presentation" onClick={handleSharepointClose}>
          <div
            className="modal animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sharepoint-modal-title"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '600px' }}
          >
            <div className="modal-header">
              <div className="integration-header">
                <div className="integration-icon" aria-hidden="true">🗂️</div>
                <div>
                  <h2 id="sharepoint-modal-title" className="integration-title">
                    SharePoint Integration
                  </h2>
                  <p className="integration-subtitle">
                    Connect your Microsoft 365 tenant to sync document libraries
                  </p>
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleSharepointClose}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="integration-status-banner">
                <div
                  className={`integration-status-indicator ${
                    sharepointStatus === 'live'
                      ? 'indicator-live'
                      : sharepointStatus === 'syncing'
                        ? 'indicator-syncing'
                        : sharepointStatus === 'unreachable'
                          ? 'indicator-error'
                          : 'indicator-idle'
                  }`}
                />
                <div>
                  <div className="integration-status-title">
                    {sharepointStatus === 'live' ? 'Connected & Syncing' :
                     sharepointStatus === 'syncing' ? 'Sync in Progress' :
                     sharepointStatus === 'unreachable' ? 'Connection Failed' :
                     'Ready to Connect'}
                  </div>
                  <div className="integration-status-message">
                    {sharepointMessage}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSharepointSubmit} className="integration-form">
                <div className="integration-form-grid">
                  <div>
                    <label htmlFor="sharepoint-tenant" className="form-label">
                      Tenant ID
                    </label>
                    <input
                      id="sharepoint-tenant"
                      value={sharepointForm.tenant_id}
                      onChange={(event) => setSharepointForm((prev) => ({ ...prev, tenant_id: event.target.value }))}
                      placeholder="contoso.onmicrosoft.com"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="sharepoint-client" className="form-label">
                      Client ID
                    </label>
                    <input
                      id="sharepoint-client"
                      value={sharepointForm.client_id}
                      onChange={(event) => setSharepointForm((prev) => ({ ...prev, client_id: event.target.value }))}
                      placeholder="Azure app registration client ID"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="sharepoint-secret" className="form-label">
                    Client Secret
                  </label>
                  <input
                    id="sharepoint-secret"
                    type="password"
                    value={sharepointForm.client_secret}
                    onChange={(event) => setSharepointForm((prev) => ({ ...prev, client_secret: event.target.value }))}
                    placeholder="Client secret (stored securely)"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="sharepoint-sites" className="form-label">
                    Site IDs
                  </label>
                  <textarea
                    id="sharepoint-sites"
                    placeholder="Comma-separated SharePoint site IDs to sync"
                    value={sharepointForm.site_ids}
                    onChange={(event) => setSharepointForm((prev) => ({ ...prev, site_ids: event.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="integration-hint">
                  <div className="integration-hint-content">
                    <span className="integration-hint-icon" aria-hidden="true">💡</span>
                    <div className="integration-hint-copy">
                      <div className="integration-hint-title">Setup Instructions</div>
                      <div className="integration-hint-list">
                        <div>1. Create an app registration in Microsoft Entra admin center</div>
                        <div>2. Grant Sites.Read.All and Files.Read.All permissions</div>
                        <div>3. Generate a client secret and copy the values above</div>
                        <div>4. Find your site IDs from SharePoint admin center</div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={handleSharepointClose}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                disabled={savingIntegration}
                onClick={(e) => {
                  e.preventDefault();
                  handleSharepointSubmit(e as any);
                }}
              >
                {savingIntegration ? (
                  <>
                    <span className="animate-pulse">⏳</span>
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <span>🔗</span>
                    Save & Test Connection
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
