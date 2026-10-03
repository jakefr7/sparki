'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  communicationRequest as request,
  communicationError,
  contactName,
  deliveryLabel,
  mergeMessages,
  type ClientThread,
  type ClientThreadDetail,
  type ClientMessage,
  type MessagePage,
  type Person,
  type QueueView,
  type TextingReadiness,
  type ThreadPage,
} from '../lib/client-communication';
import { ClinicApiError } from '../lib/clinic-api';
import './client-communication.css';

const views: [QueueView, string][] = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['open', 'Open'],
  ['waiting', 'Waiting'],
  ['mine', 'Mine'],
  ['unassigned', 'Unassigned'],
  ['problems', 'Delivery issues'],
  ['closed', 'Closed'],
];
const statusNames = { OPEN: 'Open', WAITING: 'Waiting for client', CLOSED: 'Closed' };
type Draft = {
  body: string;
  patientId: string;
  pending?: { body: string; patientId: string; key: string } | undefined;
};
const emptyDraft: Draft = { body: '', patientId: '' };
function time(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export function ClientCommunicationWorkspace() {
  const searchParams = useSearchParams();
  const [readiness, setReadiness] = useState<TextingReadiness | null>(null);
  const [readyError, setReadyError] = useState('');
  const [view, setView] = useState<QueueView>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<ThreadPage>({ threads: [], nextCursor: null, counts: null });
  const [queueError, setQueueError] = useState('');
  const [queueLoading, setQueueLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('thread'));
  const [loadedThread, setActive] = useState<ClientThreadDetail | null>(null);
  const active = loadedThread?.id === activeId ? loadedThread : null;
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [detailError, setDetailError] = useState('');
  const [actionError, setActionError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [assignees, setAssignees] = useState<Person[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const queueSize = useRef(30);
  const queueGeneration = useRef(0);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const scrollToEnd = useRef(false);
  const draft = activeId ? (drafts[activeId] ?? emptyDraft) : emptyDraft;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await request<TextingReadiness>('readiness', { signal: controller.signal });
        setReadiness(result);
        setReadyError('');
      } catch (error) {
        if (!controller.signal.aborted) setReadyError(communicationError(error));
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!readiness?.visible) return;
    let cancelled = false;
    void request<Person[]>('assignees')
      .then((result) => {
        if (!cancelled) setAssignees(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [readiness?.visible]);

  const queuePath = useCallback(
    (cursor?: string, limit = 30) => {
      const params = new URLSearchParams({ view, search: query, limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return `threads?${params}`;
    },
    [view, query],
  );
  useEffect(() => {
    if (!readiness?.visible) return;
    const controller = new AbortController();
    let fetching = false;
    ++queueGeneration.current;
    queueSize.current = 30;
    setQueueLoading(true);
    const load = async (initial = false) => {
      if (fetching) return;
      fetching = true;
      try {
        const result = await request<ThreadPage>(
          queuePath(undefined, Math.min(100, queueSize.current)),
          { signal: controller.signal },
        );
        while (result.nextCursor && result.threads.length < queueSize.current) {
          const next = await request<ThreadPage>(queuePath(result.nextCursor), {
            signal: controller.signal,
          });
          result.threads.push(...next.threads);
          result.nextCursor = next.nextCursor;
        }
        if (!controller.signal.aborted) {
          setPage((current) => {
            if (initial) return result;
            // Preserve loaded pages and the selected row while updating existing
            // rows. New rows appear at the top; pagination remains explicit.
            const fresh = new Map(result.threads.map((row) => [row.id, row]));
            const rows = current.threads
              .filter((row) => fresh.has(row.id))
              .map((row) => fresh.get(row.id)!);
            const known = new Set(rows.map((row) => row.id));
            return {
              threads: [...result.threads.filter((row) => !known.has(row.id)), ...rows],
              counts: result.counts,
              nextCursor: result.nextCursor,
            };
          });
          setQueueError('');
        }
      } catch (error) {
        if (!controller.signal.aborted) setQueueError(communicationError(error));
      } finally {
        fetching = false;
        if (!controller.signal.aborted) setQueueLoading(false);
      }
    };
    void load(true);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [queuePath, readiness?.visible, refresh]);

  useEffect(() => {
    setActive(null);
    setMessages([]);
    setOlderCursor(null);
    setDetailError('');
    setActionError('');
    setConsentOpen(false);
    setNewMessages(false);
    nearBottom.current = true;
    if (!activeId || !readiness?.visible) {
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    let fetching = false;
    let since: string | null = null;
    setDetailLoading(true);
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const [thread, transcript] = await Promise.all([
          request<ClientThreadDetail>(`threads/${activeId}`, { signal: controller.signal }),
          request<MessagePage>(
            `threads/${activeId}/messages${since ? `?changedSince=${encodeURIComponent(since)}` : ''}`,
            { signal: controller.signal },
          ),
        ]);
        if (controller.signal.aborted) return;
        setActive((current) =>
          current && current.id === thread.id && current.version > thread.version
            ? current
            : thread,
        );
        setMessages((current) => {
          const ids = new Set(current.map((message) => message.id));
          if (transcript.messages.some((message) => !ids.has(message.id))) {
            if (nearBottom.current) scrollToEnd.current = true;
            else setNewMessages(true);
          }
          return mergeMessages(current, transcript.messages);
        });
        if (!since) setOlderCursor(transcript.olderCursor);
        since = transcript.asOf;
        setDetailError('');
      } catch (error) {
        if (!controller.signal.aborted) setDetailError(communicationError(error));
      } finally {
        fetching = false;
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [activeId, readiness?.visible]);
  useLayoutEffect(() => {
    if (scrollToEnd.current && history.current) {
      history.current.scrollTop = history.current.scrollHeight;
      scrollToEnd.current = false;
    }
  }, [messages]);

  const reloadThread = async (id: string) => {
    const thread = await request<ClientThreadDetail>(`threads/${id}`);
    if (activeRef.current === id) setActive(thread);
    setPage((current) => ({
      ...current,
      threads: current.threads.map((row) => (row.id === id ? thread : row)),
    }));
  };
  const action = async (path: string, init: RequestInit) => {
    if (!active || busy) return;
    const id = active.id;
    setBusy(true);
    setActionError('');
    try {
      await request(path, init);
      await reloadThread(id);
      setRefresh((n) => n + 1);
      return true;
    } catch (error) {
      if (activeRef.current === id) setActionError(communicationError(error));
      if (error instanceof ClinicApiError && error.code === 'THREAD_CHANGED')
        await reloadThread(id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  const patch = (changes: Record<string, unknown>) =>
    active &&
    action(`threads/${active.id}`, json('PATCH', { expectedVersion: active.version, ...changes }));
  const updateDraft = (changes: Partial<Draft>) =>
    activeId &&
    setDrafts((current) => ({
      ...current,
      [activeId]: { ...(current[activeId] ?? emptyDraft), ...changes },
    }));
  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !active ||
      busy ||
      (!active.sendEligibility.canSend && !draft.pending) ||
      !draft.body.trim() ||
      readyError
    )
      return;
    const id = active.id;
    const pending = draft.pending ?? {
      body: draft.body,
      patientId: draft.patientId,
      key: crypto.randomUUID(),
    };
    updateDraft({ pending });
    setBusy(true);
    setActionError('');
    try {
      const result = await request<{ message: ClientMessage }>(
        `threads/${id}/messages`,
        json('POST', {
          body: pending.body,
          idempotencyKey: pending.key,
          ...(pending.patientId ? { patientId: pending.patientId } : {}),
        }),
      );
      setDrafts((current) => ({
        ...current,
        [id]: { body: '', patientId: current[id]?.patientId ?? '' },
      }));
      if (activeRef.current === id) {
        scrollToEnd.current = nearBottom.current;
        setMessages((current) => mergeMessages(current, [result.message]));
      }
      // The send is known to be saved. A refresh failure must not restore it
      // as an uncertain send or invite a duplicate.
      await reloadThread(id).catch(() => undefined);
      setRefresh((n) => n + 1);
    } catch (error) {
      if (error instanceof ClinicApiError && error.status < 500) {
        setDrafts((current) => ({
          ...current,
          [id]: { ...(current[id] ?? emptyDraft), pending: undefined },
        }));
      }
      if (activeRef.current === id)
        setActionError(
          error instanceof ClinicApiError && error.status < 500
            ? communicationError(error)
            : 'We couldn’t confirm whether this was saved. Check send safely to retrieve or save this exact message once.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    if (!active || !olderCursor || busy) return;
    const id = active.id;
    const container = history.current;
    const height = container?.scrollHeight ?? 0;
    setBusy(true);
    try {
      const result = await request<MessagePage>(
        `threads/${id}/messages?before=${encodeURIComponent(olderCursor)}`,
      );
      if (activeRef.current !== id) return;
      scrollToEnd.current = false;
      setMessages((current) => mergeMessages(current, result.messages));
      setOlderCursor(result.olderCursor);
      requestAnimationFrame(() => {
        if (container && activeRef.current === id)
          container.scrollTop += container.scrollHeight - height;
      });
    } catch (error) {
      if (activeRef.current === id) setActionError(communicationError(error));
    } finally {
      setBusy(false);
    }
  }
  async function moreThreads() {
    if (!page.nextCursor || queueLoading) return;
    const path = queuePath(page.nextCursor);
    const generation = queueGeneration.current;
    setQueueLoading(true);
    try {
      const result = await request<ThreadPage>(path);
      if (generation !== queueGeneration.current) return;
      queueSize.current = queueSize.current + result.threads.length;
      setPage((current) => ({
        ...current,
        threads: [
          ...current.threads,
          ...result.threads.filter(
            (row) => !current.threads.some((existing) => existing.id === row.id),
          ),
        ],
        nextCursor: result.nextCursor,
      }));
    } catch (error) {
      if (generation === queueGeneration.current) setQueueError(communicationError(error));
    } finally {
      if (generation === queueGeneration.current) setQueueLoading(false);
    }
  }

  if (!readiness)
    return (
      <div className="cc-state" role="status">
        {readyError ? (
          <>
            <h2>Client texting couldn’t load</h2>
            <p>{readyError}</p>
            <button onClick={() => setRefresh((n) => n + 1)}>Try again</button>
          </>
        ) : (
          'Loading client texting…'
        )}
      </div>
    );
  if (!readiness.visible)
    return (
      <div className="cc-state">
        <h1>Client texting unavailable</h1>
        <p>{readiness.reason ?? 'This clinic has not set up texting yet.'}</p>
        <Link href="/today">Return to Today</Link>
      </div>
    );

  return (
    <div
      className={`cc-workspace${activeId ? ' cc-workspace--selected' : ''}${contextOpen ? ' cc-workspace--context' : ''}`}
    >
      <header className="cc-topbar">
        <div>
          <h1>Client communication</h1>
          <span>
            {readiness.location.name}
            {readiness.senderPhoneDisplay ? ` · ${readiness.senderPhoneDisplay}` : ''}
          </span>
        </div>
        <span className={`cc-mode${readiness.mode === 'SIMULATED' ? ' cc-mode--test' : ''}`}>
          {readiness.mode === 'SIMULATED' ? 'Test clinic · simulated SMS' : 'Clinic texting'}
        </span>
      </header>
      {readyError && (
        <div className="cc-banner" role="alert">
          Texting availability couldn’t refresh. Sending is paused until we reconnect.{' '}
          <button onClick={() => setRefresh((n) => n + 1)}>Retry</button>
        </div>
      )}
      <aside className="cc-queue" aria-label="Client conversations">
        <div className="cc-queue-heading">
          <h2>Inbox</h2>
          <button
            className="cc-primary"
            onClick={() => setNewOpen((open) => !open)}
            aria-expanded={newOpen}
          >
            New conversation
          </button>
        </div>
        {newOpen && (
          <NewConversation
            onClose={() => setNewOpen(false)}
            onOpen={(thread) => {
              setActiveId(thread.id);
              setNewOpen(false);
            }}
          />
        )}
        <label className="cc-search">
          <span>Search conversations</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Client, patient or phone"
            maxLength={100}
          />
        </label>
        <nav className="cc-filters" aria-label="Conversation filters">
          {views
            .filter(([key]) => ['all', 'unread', 'mine'].includes(key))
            .map(([key, label]) => (
              <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>
                {label}
                {!!page.counts?.[key] && <span>{page.counts[key]}</span>}
              </button>
            ))}
        </nav>
        <div className="cc-queue-summary">
          <span>{views.find(([key]) => key === view)?.[1]} conversations</span>
          <label className="cc-more-views">
            <span className="cc-sr-only">More conversation filters</span>
            <select
              aria-label="More conversation filters"
              value={['all', 'unread', 'mine'].includes(view) ? '' : view}
              onChange={(event) => {
                if (event.target.value) setView(event.target.value as QueueView);
              }}
            >
              <option value="">More views</option>
              {views
                .filter(([key]) => !['all', 'unread', 'mine'].includes(key))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                    {page.counts?.[key] ? ` (${page.counts[key]})` : ''}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {queueError && (
          <div className="cc-inline-error" role="alert">
            {queueError}
            <button onClick={() => setRefresh((n) => n + 1)}>Retry</button>
          </div>
        )}
        <div className="cc-rows" aria-busy={queueLoading}>
          {page.threads.map((thread) => (
            <button
              key={thread.id}
              className={`cc-row${activeId === thread.id ? ' cc-row--selected' : ''}`}
              aria-current={activeId === thread.id ? 'true' : undefined}
              onClick={() => {
                setActiveId(thread.id);
                setContextOpen(false);
              }}
            >
              <span className="cc-avatar" aria-hidden="true">
                {thread.client ? `${thread.client.firstName[0]}${thread.client.lastName[0]}` : '?'}
              </span>
              <span className="cc-row-copy">
                <span>
                  <strong>{contactName(thread)}</strong>
                  <time>
                    {new Date(thread.lastMessageAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </span>
                <span className="cc-row-meta">
                  {thread.assignedTo?.name ?? 'Unassigned'} · {statusNames[thread.status]}
                </span>
                <span className="cc-snippet">
                  {thread.lastMessage?.source === 'AUTOMATED' ? 'Automated: ' : ''}
                  {thread.lastMessage?.body ?? 'No messages yet'}
                </span>
                {thread.deliveryProblemSince && (
                  <span className="cc-problem">Delivery needs attention</span>
                )}
                {drafts[thread.id]?.body && (
                  <span className="cc-draft-tag">Draft saved in this session</span>
                )}
              </span>
              {thread.unread && (
                <span className="cc-unread" aria-label={`${thread.unreadCount || 1} unread`}>
                  {thread.unreadCount || '•'}
                </span>
              )}
            </button>
          ))}
          {!page.threads.length && !queueLoading && !queueError && (
            <div className="cc-empty">
              <h3>{query ? 'No matches' : 'No conversations here'}</h3>
              <p>
                {query
                  ? 'Try a client name, patient name or phone digits.'
                  : 'Start a conversation or choose another filter.'}
              </p>
            </div>
          )}
          {queueLoading && !page.threads.length && (
            <p className="cc-empty" role="status">
              Loading conversations…
            </p>
          )}
          {page.nextCursor && (
            <button
              className="cc-load-more"
              disabled={queueLoading}
              onClick={() => void moreThreads()}
            >
              Load more conversations
            </button>
          )}
        </div>
      </aside>
      <section className="cc-conversation" aria-label="Selected conversation">
        {!activeId ? (
          <div className="cc-empty cc-welcome">
            <span className="cc-welcome-mark" aria-hidden="true">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M20 11.5a8 8 0 0 1-8 8H5l-4 3v-11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z" />
                <path d="M7 9h7M7 13h5" />
              </svg>
            </span>
            <span className="cc-eyebrow">YOUR CLINIC’S SHARED INBOX</span>
            <h2>Keep the conversation moving</h2>
            <p>Select a conversation to reply, see patient context, or hand it to a teammate.</p>
            <button className="cc-primary" onClick={() => setNewOpen(true)}>
              Start a conversation
            </button>
            <small>Messages stay unread until you mark them read.</small>
          </div>
        ) : (
          <>
            <button className="cc-back" onClick={() => setActiveId(null)}>
              ← Conversations
            </button>
            {detailLoading && !active && (
              <p className="cc-empty" role="status">
                Loading conversation…
              </p>
            )}
            {detailError && (
              <div className="cc-inline-error" role="alert">
                {detailError}
                <button
                  onClick={() => {
                    const id = activeId;
                    setActiveId(null);
                    setTimeout(() => setActiveId(id), 0);
                  }}
                >
                  Retry conversation
                </button>
              </div>
            )}
            {active && (
              <>
                <header className="cc-conversation-heading">
                  <div>
                    <h2>{contactName(active)}</h2>
                    <a href={`tel:${active.contactPhone}`}>{active.contactPhoneDisplay}</a>
                  </div>
                  <button
                    onClick={() => setContextOpen((open) => !open)}
                    aria-expanded={contextOpen}
                  >
                    Client details
                  </button>
                </header>
                <div className="cc-tools">
                  <label>
                    Status
                    <select
                      value={active.status}
                      disabled={busy}
                      onChange={(event) => void patch({ status: event.target.value })}
                    >
                      <option value="OPEN">Open</option>
                      <option value="WAITING">Waiting for client</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </label>
                  <label>
                    Assigned to
                    <select
                      value={active.assignedTo?.id ?? ''}
                      disabled={busy}
                      onChange={(event) => void patch({ assignedToId: event.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(`threads/${active.id}/${active.unread ? 'read' : 'unread'}`, {
                        method: 'POST',
                      })
                    }
                  >
                    {active.unread ? 'Mark read' : 'Mark unread'}
                  </button>
                </div>
                {readiness.mode === 'SIMULATED' && (
                  <div className="cc-simulation">
                    Simulation only. Messages stay in Sparki and never reach a client.
                  </div>
                )}
                {active.matchState !== 'MATCHED' && (
                  <div className="cc-match">
                    {active.matchState === 'SHARED'
                      ? 'Shared phone number. Check the client and patient before replying.'
                      : 'This number needs client matching. Review Client details before replying.'}
                  </div>
                )}
                {actionError && (
                  <div className="cc-inline-error" role="alert">
                    {actionError}
                  </div>
                )}
                <div
                  className="cc-history"
                  ref={history}
                  onScroll={() => {
                    const box = history.current;
                    if (box) {
                      nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
                      if (nearBottom.current) setNewMessages(false);
                    }
                  }}
                >
                  {olderCursor && (
                    <button className="cc-load-more" disabled={busy} onClick={() => void older()}>
                      Load earlier messages
                    </button>
                  )}
                  {!messages.length && (
                    <div className="cc-empty">
                      <p>No messages yet. Check the texting agreement before composing.</p>
                    </div>
                  )}
                  {messages.map((message, index) => (
                    <div key={message.id}>
                      {(index === 0 ||
                        new Date(messages[index - 1]!.createdAt).toDateString() !==
                          new Date(message.createdAt).toDateString()) && (
                        <div className="cc-day">
                          {new Date(message.createdAt).toLocaleDateString([], {
                            weekday: 'short',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </div>
                      )}
                      <article
                        className={`cc-message${message.direction === 'OUTBOUND' ? ' cc-message--outbound' : ''}${message.source === 'AUTOMATED' ? ' cc-message--automated' : ''}`}
                      >
                        <div className="cc-message-author">
                          {message.source === 'AUTOMATED'
                            ? 'Automated appointment notice'
                            : message.direction === 'INBOUND'
                              ? contactName(active)
                              : (message.sender?.name ?? 'Clinic team')}
                          {message.patientId && (
                            <span>
                              {' '}
                              ·{' '}
                              {active.patients.find((patient) => patient.id === message.patientId)
                                ?.name ?? 'Linked patient'}
                            </span>
                          )}
                        </div>
                        <div className="cc-bubble">{message.body}</div>
                        {message.attachments.map((file) => (
                          <div key={file.id} className="cc-attachment">
                            {file.status === 'STORED' ? (
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                href={`/api/client-communication/attachments/${encodeURIComponent(file.id)}`}
                              >
                                Open {file.mimeType === 'application/pdf' ? 'PDF' : 'image'} ↗
                              </a>
                            ) : (
                              <span>
                                {file.status === 'PENDING'
                                  ? 'Attachment loading…'
                                  : 'Attachment unavailable'}
                              </span>
                            )}
                          </div>
                        ))}
                        <small>
                          {time(message.createdAt)} · {deliveryLabel(message)}
                        </small>
                        {message.failure && <p className="cc-problem">{message.failure.message}</p>}
                        {message.canResend && message.source === 'STAFF' && (
                          <div className="cc-resend">
                            {message.status === 'OUTCOME_UNKNOWN' && (
                              <p>
                                This may have arrived. Check with the client before sending again.
                              </p>
                            )}
                            <button
                              disabled={!!draft.body || busy}
                              onClick={() =>
                                updateDraft({
                                  body: message.body,
                                  patientId: message.patientId ?? '',
                                  pending: undefined,
                                })
                              }
                            >
                              Copy into a new draft
                            </button>
                          </div>
                        )}
                      </article>
                    </div>
                  ))}
                </div>
                {newMessages && (
                  <button
                    className="cc-new-messages"
                    onClick={() => {
                      if (history.current) history.current.scrollTop = history.current.scrollHeight;
                      nearBottom.current = true;
                      setNewMessages(false);
                    }}
                  >
                    ↓ New messages
                  </button>
                )}
                <form className="cc-composer" onSubmit={(event) => void send(event)}>
                  <div className="cc-compose-heading">
                    <strong>
                      To {contactName(active)} · {active.contactPhoneDisplay}
                    </strong>
                    {active.patients.length > 0 && (
                      <label>
                        About
                        <select
                          aria-label="Patient context"
                          value={draft.patientId}
                          disabled={busy || !!draft.pending}
                          onChange={(event) => updateDraft({ patientId: event.target.value })}
                        >
                          <option value="">No patient selected</option>
                          {active.patients.map((patient) => (
                            <option key={patient.id} value={patient.id}>
                              {patient.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  {!active.sendEligibility.canSend && (
                    <p className="cc-blocked">{active.sendEligibility.message}</p>
                  )}
                  <textarea
                    aria-label="Message to client"
                    placeholder="Write a reply…"
                    maxLength={readiness.limits.maxMessageLength}
                    rows={3}
                    value={draft.body}
                    disabled={busy || !!draft.pending}
                    onChange={(event) => updateDraft({ body: event.target.value })}
                    onKeyDown={(event) => {
                      if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key === 'Enter' &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="cc-compose-footer">
                    <span>
                      {draft.body.length}/{readiness.limits.maxMessageLength} · Ctrl/⌘ + Enter
                    </span>
                    <button
                      className="cc-primary"
                      disabled={
                        busy ||
                        !draft.body.trim() ||
                        (!active.sendEligibility.canSend && !draft.pending) ||
                        !!readyError
                      }
                      type="submit"
                    >
                      {busy
                        ? 'Working…'
                        : draft.pending
                          ? 'Check send safely'
                          : readiness.mode === 'SIMULATED'
                            ? 'Save simulated message'
                            : 'Send text'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </section>
      {active && (
        <aside className="cc-context" aria-label="Client details">
          <header>
            <h2>Client details</h2>
            <button className="cc-context-close" onClick={() => setContextOpen(false)}>
              Close details
            </button>
          </header>
          <section>
            <h3>Client and contact</h3>
            <strong>{contactName(active)}</strong>
            <p>
              <a href={`tel:${active.contactPhone}`}>{active.contactPhoneDisplay}</a>
            </p>
            <p>{active.contact.email ?? 'No email on file'}</p>
            {active.clientCandidates.length > 0 && active.matchState !== 'MATCHED' && (
              <label>
                Link this conversation
                <select
                  value={active.client?.id ?? ''}
                  disabled={busy}
                  onChange={(event) => void patch({ clientId: event.target.value || null })}
                >
                  <option value="">Not linked</option>
                  {active.clientCandidates.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.firstName} {client.lastName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
          <section>
            <h3>Texting agreement</h3>
            <p>
              <strong>
                {active.sendEligibility.canSend ? 'Staff may text' : 'Staff texting blocked'}
              </strong>
            </p>
            <p>
              {active.consent.automatedTextsAllowed
                ? 'Recorded agreement allows automated appointment texts.'
                : 'Automated appointment texts need staff-recorded agreement.'}
            </p>
            {active.consent.recordedAt && (
              <small>
                Last recorded {time(active.consent.recordedAt)}
                {active.consent.recordedBy ? ` by ${active.consent.recordedBy.name}` : ''}
              </small>
            )}
            {active.consent.status === 'OPTED_OUT' && !active.consent.staffMayGrant && (
              <p className="cc-problem">
                The client opted out. Only their START reply can restore staff texting.
              </p>
            )}
            {active.consent.staffMayGrant && active.client && (
              <button
                disabled={busy}
                onClick={() => setConsentOpen((open) => !open)}
                aria-expanded={consentOpen}
              >
                Record client agreement
              </button>
            )}
            {consentOpen && active.consent.staffMayGrant && active.client && (
              <ConsentForm
                busy={busy}
                onSave={async (body) => {
                  const saved = await action(`threads/${active.id}/consent`, json('PUT', body));
                  if (saved) setConsentOpen(false);
                }}
              />
            )}
            {active.consent.status !== 'OPTED_OUT' && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(`threads/${active.id}/consent`, json('PUT', { status: 'OPTED_OUT' }))
                }
              >
                Record opt-out
              </button>
            )}
          </section>
          <section>
            <h3>Patients</h3>
            {active.patients.length ? (
              active.patients.map((patient) => (
                <Link className="cc-patient" key={patient.id} href={`/patients/${patient.id}`}>
                  <strong>{patient.name} ↗</strong>
                  <span>
                    {patient.species}
                    {patient.breed ? ` · ${patient.breed}` : ''}
                  </span>
                </Link>
              ))
            ) : (
              <p>No patient linked.</p>
            )}
            <small>Choose the patient on each reply when relevant.</small>
          </section>
          {active.events.length > 0 && (
            <section>
              <h3>Recent handoffs</h3>
              {active.events.slice(0, 5).map((event) => (
                <p key={event.id} className="cc-event">
                  {event.type.toLowerCase().replaceAll('_', ' ')}
                  <small>
                    {event.actor?.name ?? 'System'} · {time(event.createdAt)}
                  </small>
                </p>
              ))}
            </section>
          )}
          {readiness.capabilities.simulateClientReply && (
            <section>
              <details>
                <summary>Test an incoming reply</summary>
                <SimulatedReply
                  busy={busy}
                  onSave={(body) =>
                    action(`threads/${active.id}/simulated-replies`, json('POST', { body }))
                  }
                />
              </details>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

function ConsentForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [method, setMethod] = useState('VERBAL');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className="cc-mini-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (confirmed) void onSave({ status: 'GRANTED', method, note });
      }}
    >
      <label>
        How agreement was received
        <select value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="VERBAL">Verbal agreement</option>
          <option value="WRITTEN_FORM">Written form</option>
          <option value="ONLINE_FORM">Online form</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label>
        Agreement note (optional)
        <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <label className="cc-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        The client agreed to clinic texts, including automated appointment messages.
      </label>
      <p>Recording agreement does not resend previously skipped notices.</p>
      <button disabled={busy || !confirmed}>Save agreement</button>
    </form>
  );
}
function SimulatedReply({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (body: string) => Promise<unknown>;
}) {
  const [body, setBody] = useState('');
  return (
    <form
      className="cc-mini-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim()) void onSave(body);
      }}
    >
      <label>
        Simulated client reply
        <textarea maxLength={1600} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <button disabled={busy || !body.trim()}>Add test reply</button>
    </form>
  );
}
function NewConversation({
  onOpen,
  onClose,
}: {
  onOpen: (thread: ClientThreadDetail) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    (ClientThread['client'] & { phone: string | null; alternatePhone: string | null })[]
  >([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setError('');
    if (query.trim().length < 2) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void fetch(`/api/clients/search?query=${encodeURIComponent(query.trim())}&limit=10`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Client search couldn’t load.');
          return response.json();
        })
        .then((result) => {
          if (!controller.signal.aborted) setResults(result);
        })
        .catch((issue) => {
          if (!controller.signal.aborted) setError(issue.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  async function open(id: string, phone: string) {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ thread: ClientThreadDetail }>(
        'threads',
        json('POST', { clientId: id, phone }),
      );
      onOpen(result.thread);
    } catch (issue) {
      setError(communicationError(issue));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cc-new">
      <div>
        <strong>Find a client</strong>
        <button onClick={onClose}>Close</button>
      </div>
      <label>
        Client name or phone
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {loading && query.trim().length >= 2 && <p role="status">Searching…</p>}
      {query.trim().length >= 2 && !loading && !results.length && !error && (
        <p>No clients found.</p>
      )}
      {results.map(
        (client) =>
          client && (
            <div className="cc-client-result" key={client.id}>
              <strong>
                {client.firstName} {client.lastName}
              </strong>
              {client.phone && (
                <button disabled={busy} onClick={() => void open(client.id, 'PRIMARY')}>
                  {client.phone}
                </button>
              )}
              {client.alternatePhone && (
                <button disabled={busy} onClick={() => void open(client.id, 'ALTERNATE')}>
                  Alternate: {client.alternatePhone}
                </button>
              )}
              {!client.phone && !client.alternatePhone && <small>No phone on file</small>}
            </div>
          ),
      )}
      <small>Starting a conversation sends nothing.</small>
    </div>
  );
}
