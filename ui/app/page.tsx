'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch, getToken } from './lib/api';
import ActionLauncher from './components/ActionLauncher';

type SourceDocument = {
  id: string;
  text: string;
  source: string;
  score?: number;
  metadata: Record<string, unknown>;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  sources?: SourceDocument[];
  conversation_id?: string;
  message_id?: string;
};

type ConversationSummary = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRecord = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

type UserProfile = {
  id: string;
  email: string;
  display_name?: string | null;
};

type IngestStatus = {
  taskId: string;
  documentId?: string | null;
  filename: string;
  state: string;
  stage?: string | null;
  detail?: string | null;
  acknowledged?: boolean;
  createdAt: number;
};

type IngestStatusResponse = {
  task_id: string;
  state: string;
  stage?: string | null;
  document_id?: string | null;
  detail?: string | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

async function sendQuery(
  query: string,
  payload: { principals: string[]; user_id?: string | null; conversation_id?: string | null }
): Promise<ChatMessage> {
  const response = await fetch(`${API_URL}/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      principals: payload.principals,
      user_id: payload.user_id,
      conversation_id: payload.conversation_id,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to query API');
  }

  const data = await response.json();
  return {
    role: 'assistant',
    content: data.answer,
    sources: data.sources ?? [],
    conversation_id: data.conversation_id,
    message_id: data.message_id,
    created_at: data.created_at ?? new Date().toISOString(),
  };
}

export default function Page() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [principals, setPrincipals] = useState<string[]>(['public']);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);
  const [ingestStatuses, setIngestStatuses] = useState<IngestStatus[]>([]);
  const ingestStatusesRef = useRef<IngestStatus[]>([]);

  useEffect(() => {
    ingestStatusesRef.current = ingestStatuses;
  }, [ingestStatuses]);

  const loadConversationMessages = useCallback(
    async (id: string) => {
      setLoadingHistory(true);
      try {
        const records = await apiFetch<MessageRecord[]>(`/v1/conversations/${id}/messages`);
        const historyMessages: ChatMessage[] = records.map((record) => ({
          role: record.role === 'user' ? 'user' : 'assistant',
          content: record.content,
          created_at: record.created_at,
          conversation_id: id,
          message_id: record.id,
        }));
        setMessages(historyMessages);
        setConversationId(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoadingHistory(false);
      }
    },
    []
  );

  const loadConversations = useCallback(
    async (selectFirst: boolean) => {
      if (!getToken()) {
        setConversations([]);
        setUserId(null);
        setConversationId(null);
        setPrincipals(['public']);
        if (selectFirst) {
          setMessages([]);
        }
        return;
      }

      try {
        const profile = await apiFetch<UserProfile>('/v1/auth/me');
        setUserId(profile.id);
        setPrincipals([`user:${profile.id}`]);

        const items = await apiFetch<ConversationSummary[]>('/v1/conversations');
        setConversations(items);
        if (selectFirst && items.length > 0) {
          await loadConversationMessages(items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      }
    },
    [loadConversationMessages]
  );

  useEffect(() => {
    loadConversations(!conversationId).catch(() => undefined);
    if (typeof window !== 'undefined') {
      const handler = () => {
        loadConversations(true).catch(() => undefined);
      };
      window.addEventListener('rag-auth-changed', handler);
      return () => window.removeEventListener('rag-auth-changed', handler);
    }
    return undefined;
  }, [loadConversations, conversationId]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === conversationId) {
        return;
      }
      await loadConversationMessages(id);
    },
    [conversationId, loadConversationMessages]
  );

  const handleNewChat = useCallback(async () => {
    setError(null);
    if (!userId) {
      router.push('/login');
      return;
    }

    try {
      const conversation = await apiFetch<ConversationSummary>('/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setConversationId(conversation.id);
      setMessages([]);
      setConversations((prev) => [conversation, ...prev.filter((item) => item.id !== conversation.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  }, [router, userId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      created_at: new Date().toISOString(),
      conversation_id: conversationId ?? undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const assistantMessage = await sendQuery(userMessage.content, {
        principals,
        user_id: userId,
        conversation_id: conversationId,
      });
      setMessages((prev) => [...prev, assistantMessage]);
      if (assistantMessage.conversation_id) {
        setConversationId(assistantMessage.conversation_id);
        loadConversations(false).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = useCallback(() => {
    router.push('/login');
  }, [router]);

  const handleDismissStatus = useCallback((taskId: string) => {
    setIngestStatuses((prev) => prev.filter((status) => status.taskId !== taskId));
  }, []);

  const lastSources = useMemo(
    () => messages.findLast((msg) => msg.role === 'assistant')?.sources ?? [],
    [messages]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const isAuthenticated = Boolean(userId);

  const describeStage = useCallback((status: IngestStatus) => {
    if (status.state === 'FAILURE') {
      return status.detail ?? `Failed to process ${status.filename}`;
    }
    switch (status.stage) {
      case 'uploading':
        return 'Uploading document';
      case 'chunking':
        return 'Splitting document into chunks';
      case 'embedding':
        return 'Generating embeddings';
      case 'indexing':
        return 'Writing vectors to the knowledge base';
      case 'finalizing':
        return 'Finalizing ingestion';
      case 'completed':
        return 'Document ready for questions';
      default:
        return status.state === 'SUCCESS' ? 'Document ready for questions' : 'Queued for processing';
    }
  }, []);

  const computeProgress = useCallback((status: IngestStatus) => {
    if (status.state === 'SUCCESS' || status.state === 'FAILURE') {
      return 1;
    }
    const stageMap: Record<string, number> = {
      uploading: 0.15,
      chunking: 0.35,
      embedding: 0.65,
      indexing: 0.85,
      finalizing: 0.95,
      completed: 1,
    };
    return stageMap[status.stage ?? ''] ?? 0.1;
  }, []);

  const formatStateLabel = useCallback((status: IngestStatus) => {
    if (status.state === 'SUCCESS') {
      return 'Ready';
    }
    if (status.state === 'FAILURE') {
      return 'Failed';
    }
    if (status.state === 'UPLOADING') {
      return 'Uploading';
    }
    if (status.state === 'PROCESSING') {
      return 'Processing';
    }
    if (status.state === 'STARTED') {
      return 'Processing';
    }
    if (status.state === 'PENDING') {
      return 'Queued';
    }
    return status.state;
  }, []);

  const pendingIngestCount = useMemo(
    () => ingestStatuses.filter((status) => status.state !== 'SUCCESS' && status.state !== 'FAILURE').length,
    [ingestStatuses]
  );

  useEffect(() => {
    if (pendingIngestCount === 0) {
      return;
    }

    let cancelled = false;

    const fetchStatuses = async () => {
      const current = ingestStatusesRef.current;
      const pending = current.filter((status) => status.state !== 'SUCCESS' && status.state !== 'FAILURE');
      if (pending.length === 0) {
        return;
      }

      await Promise.all(
        pending.map(async (status) => {
          try {
            const data = await apiFetch<IngestStatusResponse>(`/v1/documents/status/${status.taskId}`);
            if (cancelled) {
              return;
            }
            setIngestStatuses((prev) =>
              prev.map((item) =>
                item.taskId === status.taskId
                  ? {
                      ...item,
                      state: data.state,
                      stage: data.stage ?? item.stage,
                      documentId: data.document_id ?? item.documentId,
                      detail: data.detail ?? item.detail,
                    }
                  : item
              )
            );
          } catch (err) {
            if (cancelled) {
              return;
            }
            const message = err instanceof Error ? err.message : 'Failed to fetch ingestion status.';
            setIngestStatuses((prev) =>
              prev.map((item) =>
                item.taskId === status.taskId
                  ? {
                      ...item,
                      state: 'FAILURE',
                      detail: message,
                    }
                  : item
              )
            );
            setError(message);
          }
        })
      );
    };

    fetchStatuses();
    const interval = window.setInterval(fetchStatuses, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pendingIngestCount]);

  useEffect(() => {
    const acknowledgeTargets = ingestStatuses.filter(
      (status) => !status.acknowledged && (status.state === 'SUCCESS' || status.state === 'FAILURE')
    );
    if (acknowledgeTargets.length === 0) {
      return;
    }

    const latest = acknowledgeTargets.reduce((latestStatus, current) =>
      current.createdAt > latestStatus.createdAt ? current : latestStatus
    );

    if (latest.state === 'SUCCESS') {
      setSuccess(`'${latest.filename}' is ready for questions.`);
      setError(null);
    } else if (latest.state === 'FAILURE') {
      setError(latest.detail ?? `'${latest.filename}' failed to process.`);
      setSuccess(null);
    }

    setIngestStatuses((prev) =>
      prev.map((item) =>
        acknowledgeTargets.some((status) => status.taskId === item.taskId)
          ? { ...item, acknowledged: true }
          : item
      )
    );
  }, [ingestStatuses]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="workspace">
      {isAuthenticated && (
        <aside className="workspace-sidebar">
          <div className="sidebar-header">
            <div>
              <h3>Conversations</h3>
              <p className="sidebar-subtitle">Organise and revisit your threads.</p>
            </div>
            <button type="button" className="ghost-button" onClick={handleNewChat}>
              New chat
            </button>
          </div>
          <div className="conversation-list">
            {conversations.length === 0 && (
              <p className="conversation-empty">Start a new chat to capture company knowledge.</p>
            )}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={`conversation-item ${conversation.id === conversationId ? 'active' : ''}`}
                onClick={() => handleSelectConversation(conversation.id)}
              >
                <span className="conversation-title">{conversation.title || 'Untitled chat'}</span>
                <span className="conversation-timestamp">
                  {new Date(conversation.updated_at || conversation.created_at).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </aside>
      )}

      <main className="workspace-main">
        <header className="chat-header">
          <div>
            <h2>{activeConversation?.title || 'New conversation'}</h2>
            <p className="chat-subtitle">
              {isAuthenticated
                ? 'Ask anything about your connected knowledge sources. Context and access policies are preserved.'
                : 'Sign in to persist conversations and manage enterprise integrations.'}
            </p>
          </div>
          {!isAuthenticated && (
            <button type="button" className="primary-button" onClick={handleSignIn}>
              Sign in to sync
            </button>
          )}
        </header>

        {loadingHistory && (
          <div className="skeleton-overlay">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        )}

        {ingestStatuses.length > 0 && (
          <section className="ingest-tracker">
            {ingestStatuses.map((status) => {
              const progress = Math.min(Math.max(computeProgress(status), 0), 1);
              return (
                <div key={status.taskId} className={`ingest-card ${status.state.toLowerCase()}`}>
                  <header className="ingest-card-header">
                    <div>
                      <h4 className="ingest-card-title">{status.filename}</h4>
                      <p className="ingest-card-stage">{describeStage(status)}</p>
                    </div>
                    <span className={`ingest-state-pill ${status.state.toLowerCase()}`}>{formatStateLabel(status)}</span>
                  </header>
                  <div className="ingest-progress">
                    <div className="ingest-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  {status.state === 'FAILURE' && status.detail && (
                    <p className="ingest-card-detail">{status.detail}</p>
                  )}
                  {(status.state === 'SUCCESS' || status.state === 'FAILURE') && (
                    <div className="ingest-card-actions">
                      <button type="button" className="ghost-button ingest-dismiss" onClick={() => handleDismissStatus(status.taskId)}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <div className={`chat-log ${messages.length === 0 ? 'empty' : ''}`} ref={logRef}>
          {messages.length === 0 && !loadingHistory ? (
            <div className="empty-state">
              <h3>{isAuthenticated ? 'How can I help today?' : 'Welcome to RAG Studio'}</h3>
              <p>
                {isAuthenticated
                  ? 'Kick off a new conversation or pick one from the left. I will remember context across messages.'
                  : 'Authenticate to unlock persistent conversations, enterprise integrations, and secure memory.'}
              </p>
              {!isAuthenticated && (
                <button type="button" className="primary-button" onClick={handleSignIn}>
                  Sign in
                </button>
              )}
            </div>
          ) : (
            messages.map((message, index) => (
              <article key={`message-${index}`} className={`message ${message.role}`}>
                <header className="message-header">
                  <span className="message-avatar">
                    {message.role === 'user' ? 'You' : 'AI'}
                  </span>
                  <span className="message-time">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </span>
                </header>
                <p>{message.content}</p>
              </article>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="chat-input">
          <div className="chat-composer">
            <ActionLauncher
              userId={userId}
              principals={principals}
              onDocumentUploaded={({ documentId: newDocumentId, taskId: newTaskId, filename }) => {
                setError(null);
                setSuccess(`Uploading '${filename}'…`);
                setIngestStatuses((prev) => {
                  const filtered = prev.filter((status) => status.taskId !== newTaskId);
                  return [
                    {
                      taskId: newTaskId,
                      documentId: newDocumentId,
                      filename,
                      state: 'UPLOADING',
                      stage: 'uploading',
                      detail: null,
                      acknowledged: false,
                      createdAt: Date.now(),
                    },
                    ...filtered,
                  ];
                });
              }}
              onError={(message) => {
                setError(message);
                setSuccess(null);
              }}
              onIntegrationSaved={() => loadConversations(false).catch(() => undefined)}
            />
            <textarea
              className="composer-input"
              rows={3}
              placeholder={
                isAuthenticated
                  ? 'Ask anything. Shift+Enter for newline.'
                  : 'Sign in to start a secure, persistent conversation.'
              }
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={!isAuthenticated || isLoading}
            />
            <button
              type="submit"
              className="composer-send"
              disabled={!isAuthenticated || isLoading || !input.trim()}
            >
              <span aria-hidden="true">{isLoading ? '…' : '➤'}</span>
              <span className="sr-only">Send message</span>
            </button>
          </div>

          <div className="chat-footer">
            <div className="chat-status">
              {error && <span className="status-error">{error}</span>}
              {!error && success && <span className="status-success">{success}</span>}
              {!error && !success && isLoading && <span className="status-running">Retrieving context…</span>}
              {!error && !success && !isLoading && isAuthenticated && conversationId && (
                <span className="status-ready">Ready • conversation #{conversationId.slice(0, 8)}</span>
              )}
            </div>
            <span>
              {isAuthenticated ? 'Secure RAG workspace' : 'Sign in to unlock uploads'}
            </span>
          </div>
        </form>

        {lastSources.length > 0 && (
          <aside className="sources">
            <h4>Sources</h4>
            <div className="source-grid">
              {lastSources.map((source) => (
                <div key={source.id} className="source-chip">
                  <div className="source-title">
                    {typeof source.metadata?.filename === 'string' ? String(source.metadata?.filename) : source.source}
                  </div>
                  {typeof source.metadata?.filename === 'string' && (
                    <div className="source-meta">Source key: {source.source}</div>
                  )}
                  <div className="source-text">
                    {source.text.slice(0, 220)}{source.text.length > 220 ? '…' : ''}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
