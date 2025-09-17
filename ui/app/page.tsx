'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch, getToken } from './lib/api';
import ActionLauncher from './components/ActionLauncher';
import NavBar from './components/NavBar';

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
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [principals, setPrincipals] = useState<string[]>(['public']);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [ingestStatuses, setIngestStatuses] = useState<IngestStatus[]>([]);
  const ingestStatusesRef = useRef<IngestStatus[]>([]);

  useEffect(() => {
    ingestStatusesRef.current = ingestStatuses;
  }, [ingestStatuses]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear notifications after 5 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

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
        setUserProfile(null);
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
        setUserProfile(profile);
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
    if (!input.trim() || isLoading) {
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
    setIsTyping(true);
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
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
      setIsTyping(false);
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

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    return conversations.filter(conv => 
      conv.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

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
    if (status.state === 'SUCCESS') return 'Ready';
    if (status.state === 'FAILURE') return 'Failed';
    if (status.state === 'UPLOADING') return 'Uploading';
    if (status.state === 'PROCESSING') return 'Processing';
    if (status.state === 'STARTED') return 'Processing';
    if (status.state === 'PENDING') return 'Queued';
    return status.state;
  }, []);

  const pendingIngestCount = useMemo(
    () => ingestStatuses.filter((status) => status.state !== 'SUCCESS' && status.state !== 'FAILURE').length,
    [ingestStatuses]
  );

  // Polling for ingestion status updates
  useEffect(() => {
    if (pendingIngestCount === 0) return;

    let cancelled = false;
    const fetchStatuses = async () => {
      const current = ingestStatusesRef.current;
      const pending = current.filter((status) => status.state !== 'SUCCESS' && status.state !== 'FAILURE');
      if (pending.length === 0) return;

      await Promise.all(
        pending.map(async (status) => {
          try {
            const data = await apiFetch<IngestStatusResponse>(`/v1/documents/status/${status.taskId}`);
            if (cancelled) return;
            
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
            if (cancelled) return;
            const message = err instanceof Error ? err.message : 'Failed to fetch ingestion status.';
            setIngestStatuses((prev) =>
              prev.map((item) =>
                item.taskId === status.taskId
                  ? { ...item, state: 'FAILURE', detail: message }
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

  // Handle ingestion status acknowledgments
  useEffect(() => {
    const acknowledgeTargets = ingestStatuses.filter(
      (status) => !status.acknowledged && (status.state === 'SUCCESS' || status.state === 'FAILURE')
    );
    if (acknowledgeTargets.length === 0) return;

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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="app-wrapper">
      <NavBar 
        userProfile={userProfile}
        isAuthenticated={isAuthenticated}
        onSignIn={handleSignIn}
      />

      <div className="app-content">
        <div className="workspace">
          <aside className={`sidebar ${isAuthenticated ? 'animate-slide-in' : ''}`}>
            {isAuthenticated ? (
              <>
                <div className="sidebar-header">
                  <div>
                    <h3 className="sidebar-title">Conversations</h3>
                    <p className="sidebar-meta">
                      {conversations.length} total • {filteredConversations.length} shown
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleNewChat}
                    title="Start new conversation"
                  >
                    <span className="sidebar-new-icon" aria-hidden="true">+</span>
                    New
                  </button>
                </div>

                <div className="sidebar-search">
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="sidebar-search-input"
                  />
                </div>

                <div className="conversation-list">
                  {filteredConversations.length === 0 && !searchQuery && (
                    <div className="sidebar-empty">
                      <div className="sidebar-empty-icon">🗨️</div>
                      <p className="sidebar-empty-text">
                        Start a new conversation to capture and explore your knowledge.
                      </p>
                    </div>
                  )}

                  {filteredConversations.length === 0 && searchQuery && (
                    <div className="sidebar-empty sidebar-empty--compact">
                      <p className="sidebar-empty-text">
                        No conversations match &quot;{searchQuery}&quot;
                      </p>
                    </div>
                  )}

                  {filteredConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      className={`conversation-item ${conversation.id === conversationId ? 'active' : ''}`}
                      onClick={() => handleSelectConversation(conversation.id)}
                    >
                      <div className="conversation-title">
                        {conversation.title || 'Untitled conversation'}
                      </div>
                      <div className="conversation-time">
                        {formatTime(conversation.updated_at || conversation.created_at)}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="sidebar-empty">
                <div className="sidebar-empty-icon">🔐</div>
                <p className="sidebar-empty-text">
                  Sign in to view your saved conversations and knowledge sources.
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSignIn}>
                  Sign In
                </button>
              </div>
            )}
          </aside>

          <section className="primary-column">
            {(error || success) && (
              <div className={`status-indicator animate-fade-in ${error ? 'status-error' : 'status-success'}`}>
                <div className={`status-dot ${error ? 'error' : 'success'}`}></div>
                {error || success}
              </div>
            )}

            <div className="chat-wrapper">
              <div className="chat-container animate-fade-in">
            <header className="chat-header">
              <div>
                <h2 className="chat-title">
                  {activeConversation?.title || 'New Conversation'}
                </h2>
                <p className="chat-subtitle">
                  {isAuthenticated
                    ? 'Ask questions about your knowledge base. All context and permissions are preserved across conversations.'
                    : 'Sign in to unlock persistent conversations, document uploads, and enterprise integrations.'}
                </p>
              </div>
              {!isAuthenticated && (
                <button type="button" className="btn btn-primary" onClick={handleSignIn}>
                  <span>🔐</span>
                  Sign In
                </button>
              )}
            </header>

            <div className="chat-messages">
              {loadingHistory && (
                <div className="skeleton-stack">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton skeleton-panel"></div>
                  ))}
                </div>
              )}

              {messages.length === 0 && !loadingHistory && (
                <div className="empty-state-wrapper">
                  <div className="empty-state">
                    <div className="empty-state-icon">🤖</div>
                    <h3 className="empty-state-title">
                      {isAuthenticated ? 'How can I help today?' : 'Welcome to RAG Enterprise'}
                    </h3>
                    <p className="empty-state-subtitle">
                      {isAuthenticated
                        ? 'Start a conversation or select one from the sidebar. I have access to your entire knowledge base and will remember our context.'
                        : 'Experience the power of enterprise-grade Retrieval-Augmented Generation. Sign in to unlock advanced features and persistent conversations.'}
                    </p>
                    {!isAuthenticated && (
                      <button type="button" className="btn btn-primary btn-lg" onClick={handleSignIn}>
                        Get Started
                      </button>
                    )}
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <article key={`message-${index}`} className={`message ${message.role} animate-fade-in`}>
                  <div className="message-header">
                    <div className="message-avatar">
                      {message.role === 'user' ? (
                        userProfile?.display_name?.[0] || userProfile?.email[0] || 'U'
                      ) : (
                        '🤖'
                      )}
                    </div>
                    <span className="message-role">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </span>
                    <span className="message-timestamp">
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                  <div className="message-content">
                    {message.content}
                  </div>
                </article>
              ))}

              {isTyping && (
                <div className="message assistant animate-fade-in">
                  <div className="message-header">
                    <div className="message-avatar">🤖</div>
                    <span className="message-role">Assistant</span>
                  </div>
                  <div className="message-content">
                    <div className="animate-pulse">Thinking...</div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
              <form onSubmit={handleSubmit}>
                <div className="chat-input-wrapper">
                  <ActionLauncher
                    userId={userId}
                    principals={principals}
                    onDocumentUploaded={({ documentId: newDocumentId, taskId: newTaskId, filename }) => {
                      setError(null);
                      setSuccess(`Uploading '${filename}'...`);
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
                    className="chat-input"
                    placeholder={
                      isAuthenticated
                        ? 'Ask anything about your knowledge base... (Shift+Enter for new line)'
                        : 'Sign in to start asking questions...'
                    }
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSubmit(event as any);
                      }
                    }}
                    disabled={!isAuthenticated || isLoading}
                    rows={1}
                    style={{
                      height: 'auto',
                      minHeight: '20px',
                      maxHeight: '120px',
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                  
                  <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={!isAuthenticated || isLoading || !input.trim()}
                    title="Send message"
                  >
                    {isLoading ? (
                      <div className="animate-pulse">⏳</div>
                    ) : (
                      <span>➤</span>
                    )}
                  </button>
                </div>
              </form>

              <div className="chat-meta-bar">
                <div className="chat-meta-left">
                  {isAuthenticated && conversationId && (
                    <span>Conversation #{conversationId.slice(0, 8)}</span>
                  )}
                  {isLoading && (
                    <span className="chat-meta-highlight">Retrieving context...</span>
                  )}
                </div>
                <span className="chat-meta-right">
                  {isAuthenticated ? 'Enterprise RAG • Secure & Private' : 'Sign in to unlock full features'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="insights-panel animate-slide-in">
        <div className="insights-sections">
          <div className="insights-section">
            <div className="insights-section-header">
              <h4>Ingestion Activity</h4>
              {ingestStatuses.length > 0 && (
                <span className={`status-indicator ${pendingIngestCount > 0 ? 'status-warning' : 'status-success'}`}>
                  {pendingIngestCount > 0 ? `${pendingIngestCount} in progress` : 'Up to date'}
                </span>
              )}
            </div>
            <div className="insights-scroll">
              {ingestStatuses.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  Upload documents to track processing progress in real time.
                </p>
              ) : (
                <div className="ingest-list">
                  {ingestStatuses.map((status) => {
                    const progress = Math.min(Math.max(computeProgress(status), 0), 1);
                    return (
                      <div key={status.taskId} className="card">
                        <div className="card-body">
                          <div className="ingest-card-header">
                            <div className="ingest-card-info">
                              <h4 className="ingest-card-title">{status.filename}</h4>
                              <p className="ingest-card-description">{describeStage(status)}</p>
                            </div>
                            <span className={`status-indicator ${
                              status.state === 'SUCCESS'
                                ? 'status-success'
                                : status.state === 'FAILURE'
                                  ? 'status-error'
                                  : 'status-warning'
                            }`}>
                              {formatStateLabel(status)}
                            </span>
                          </div>

                          <div className="progress-bar ingest-progress">
                            <div
                              className="progress-fill"
                              style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                          </div>

                          {status.state === 'FAILURE' && status.detail && (
                            <p className="ingest-card-error">{status.detail}</p>
                          )}

                          {(status.state === 'SUCCESS' || status.state === 'FAILURE') && (
                            <div className="ingest-card-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleDismissStatus(status.taskId)}
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="insights-section">
            <div className="insights-section-header">
              <h4>Knowledge Sources</h4>
              {lastSources.length > 0 && (
                <span className="text-xs text-text-tertiary">{lastSources.length} cited</span>
              )}
            </div>
            <div className="insights-scroll">
              {lastSources.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  Ask a question to surface the most relevant context from your knowledge base.
                </p>
              ) : (
                <div className="sources-grid">
                  {lastSources.map((source) => (
                    <div key={source.id} className="source-card">
                      <div className="source-title">
                        {typeof source.metadata?.filename === 'string'
                          ? String(source.metadata?.filename)
                          : source.source}
                      </div>
                      {source.score && (
                        <div className="source-score">
                          Relevance: {Math.round(source.score * 100)}%
                        </div>
                      )}
                      <div className="source-text">
                        {source.text.slice(0, 200)}
                        {source.text.length > 200 ? '...' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
      </div>
    </div>
  </div>
);
}
