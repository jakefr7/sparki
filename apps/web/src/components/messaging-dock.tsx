'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { conversationName, personName, type MessagePerson, type StaffConversation, type StaffMessage } from '../lib/messaging-types';
import { useCurrentUser } from '../lib/use-current-user';
import type { MessagingContext } from './message-staff-button';

const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', PRACTICE_MANAGER: 'Practice Manager', RECEPTIONIST: 'Receptionist', VETERINARIAN: 'Veterinarian', TECHNICIAN: 'Technician', ASSISTANT: 'Assistant' };
type Filter = 'ALL' | 'UNREAD' | 'DIRECT' | 'CHANNEL';

function initials(person: MessagePerson) { return `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase(); }
function messageTime(value: string) { const date = new Date(value); return date.toLocaleDateString() === new Date().toLocaleDateString() ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
async function api(path: string, init?: RequestInit) { const response = await fetch(`/api/messaging/${path}`, { cache: 'no-store', ...init }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Messaging request failed'); return response.json(); }

export function MessagingDock() {
  const { user, loading } = useCurrentUser();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  if (loading || !user || user.role === 'CLIENT' || pathname === '/messages' || pathname === '/communication') return null;
  return <MessagingExperience currentUserId={user.id} expanded={expanded} onExpandedChange={setExpanded} />;
}

export function MessagingWorkspace({ currentUserId }: { currentUserId: string }) {
  return <MessagingExperience currentUserId={currentUserId} expanded onExpandedChange={() => undefined} page />;
}

function MessagingExperience({ currentUserId, expanded, onExpandedChange, page = false }: { currentUserId: string; expanded: boolean; onExpandedChange: (value: boolean) => void; page?: boolean }) {
  const [conversations, setConversations] = useState<StaffConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [newMessage, setNewMessage] = useState(false);
  const [staff, setStaff] = useState<Array<MessagePerson & { name: string; locations: Array<{ id: string; name: string }> }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [suggestedContext, setSuggestedContext] = useState<MessagingContext | null>(null);
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const unread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  const loadConversations = useCallback(async () => {
    try {
      const rows = await api(`conversations${search ? `?search=${encodeURIComponent(search)}` : ''}`) as StaffConversation[];
      setConversations(rows);
      setActiveId((current) => current && rows.some((row) => row.id === current) ? current : (page ? rows[0]?.id ?? null : current));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load messaging.'); }
  }, [page, search]);

  useEffect(() => { void loadConversations(); const timer = window.setInterval(() => void loadConversations(), 5000); return () => window.clearInterval(timer); }, [loadConversations]);
  useEffect(() => { if (!activeId) { setMessages([]); return; } let cancelled = false; const load = () => api(`conversations/${activeId}/messages`).then((body: { messages: StaffMessage[] }) => { if (!cancelled) setMessages(body.messages); }).catch(() => undefined); void load(); const timer = window.setInterval(load, 3000); return () => { cancelled = true; window.clearInterval(timer); }; }, [activeId]);
  useEffect(() => { if (!activeId || !expanded) return; void api(`conversations/${activeId}/membership`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markRead: true, drawerOpen: true, drawerMinimized: false }) }).then(loadConversations); }, [activeId, expanded, loadConversations]);
  useEffect(() => { const base = 'Sparki'; document.title = unread ? `(${unread}) ${base}` : base; return () => { document.title = base; }; }, [unread]);
  useEffect(() => { if (!newMessage) return; void api('directory').then(setStaff).catch(() => setStaff([])); }, [newMessage]);
  useEffect(() => { function open(event: Event) { setSuggestedContext((event as CustomEvent<MessagingContext>).detail); setNewMessage(true); onExpandedChange(true); } window.addEventListener('sparki:message-staff', open); return () => window.removeEventListener('sparki:message-staff', open); }, [onExpandedChange]);

  const visible = useMemo(
    () => conversations.filter((conversation) =>
      filter === 'ALL' ||
      (filter === 'UNREAD' && conversation.unreadCount > 0) ||
      (filter === 'DIRECT' && conversation.type === 'DIRECT') ||
      (filter === 'CHANNEL' && conversation.type !== 'DIRECT'),
    ),
    [conversations, filter],
  );

  async function beginDirect(person: MessagePerson) {
    const created = await api('conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'DIRECT', memberIds: [person.id] }) }) as { id: string };
    setNewMessage(false); setActiveId(created.id); onExpandedChange(true); await loadConversations();
  }
  async function updateMembership(values: Record<string, unknown>) { if (!active) return; await api(`conversations/${active.id}/membership`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); await loadConversations(); }

  if (!page && !expanded) return <button type="button" className="messaging-collapsed" onClick={() => onExpandedChange(true)} aria-label={`Open Messaging${unread ? `, ${unread} unread` : ''}`}><span className={unread ? 'messaging-presence messaging-presence--unread' : 'messaging-presence'} aria-hidden="true"/><strong>Messaging</strong>{unread ? <span className="messaging-unread-badge">{unread > 99 ? '99+' : unread}</span> : null}<span aria-hidden="true">⌃</span></button>;

  const content = <>
    <aside className="messaging-list">
      <header className="messaging-list__header"><div><strong>Messaging</strong><span>{unread ? `${unread} unread` : 'All caught up'}</span></div><div><Link href="/messages" aria-label="Open all messages">↗</Link><button type="button" onClick={() => setNewMessage(true)} aria-label="New message">＋</button>{!page ? <button type="button" onClick={() => onExpandedChange(false)} aria-label="Minimize messaging">—</button> : null}</div></header>
      <label className="messaging-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" aria-label="Search conversations" /></label>
      <div className="messaging-filters" role="tablist">{(['ALL','UNREAD','DIRECT','CHANNEL'] as Filter[]).map((value) => <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{value === 'DIRECT' ? 'Direct' : value === 'CHANNEL' ? 'Channels' : value.charAt(0) + value.slice(1).toLowerCase()}</button>)}</div>
      <div className="messaging-conversations">{visible.length ? visible.map((conversation) => {
        const other = conversation.members.find((member) => member.userId !== currentUserId)?.user ?? conversation.members[0]?.user;
        const latest = conversation.messages[0];
        return <button key={conversation.id} type="button" className={`messaging-conversation${activeId === conversation.id ? ' messaging-conversation--active' : ''}`} onClick={() => setActiveId(conversation.id)} aria-label={`${conversationName(conversation, currentUserId)}${conversation.unreadCount ? `, ${conversation.unreadCount} unread` : ''}`}>
          <span className="messaging-avatar" style={{ background: other?.staffProfile?.color ?? undefined }}>{other ? initials(other) : '#'}</span><span className="messaging-conversation__copy"><span><strong>{conversationName(conversation, currentUserId)}</strong><time>{latest ? messageTime(latest.createdAt) : ''}</time></span><small>{latest?.deletedAt ? 'Message removed' : latest?.body || latest?.attachments[0]?.previewLabel || 'Start the conversation'}</small></span>{conversation.unreadCount ? <span className="messaging-unread-badge">{conversation.unreadCount}</span> : null}{conversation.membership.isPinned ? <span title="Pinned">•</span> : null}
        </button>;
      }) : <div className="messaging-empty"><strong>No conversations</strong><span>Start a message with someone on your clinic team.</span></div>}</div>
    </aside>
    <main className="messaging-thread">{active ? <>
      <header className="messaging-thread__header"><div><strong>{conversationName(active, currentUserId)}</strong><span>{active.type === 'DIRECT' ? ROLE_LABELS[active.members.find((member) => member.userId !== currentUserId)?.user.role ?? ''] : `${active.members.length} members`}</span></div><div className="messaging-thread__actions"><button onClick={() => void updateMembership({ isPinned: !active.membership.isPinned })} title={active.membership.isPinned ? 'Unpin' : 'Pin'}>⌖</button><button onClick={() => void updateMembership({ notificationLevel: active.membership.notificationLevel === 'MUTED' ? 'ALL' : 'MUTED' })} title={active.membership.notificationLevel === 'MUTED' ? 'Unmute' : 'Mute'}>{active.membership.notificationLevel === 'MUTED' ? '⊘' : '◉'}</button><button onClick={() => void updateMembership({ markedUnread: true })} title="Mark unread">●</button><button onClick={() => void updateMembership({ isArchived: true, drawerOpen: false })} title="Archive">⌄</button></div></header>
      <MessageHistory messages={messages} currentUserId={currentUserId} />
      <MessageComposer conversation={active} suggestedContext={suggestedContext} onRemoveContext={() => setSuggestedContext(null)} onSent={async () => { setSuggestedContext(null); const body = await api(`conversations/${active.id}/messages`) as { messages: StaffMessage[] }; setMessages(body.messages); await loadConversations(); }} />
    </> : <div className="messaging-thread__blank"><span aria-hidden="true">✦</span><strong>Your clinic conversations</strong><p>Select a conversation or start a new message.</p><button type="button" onClick={() => setNewMessage(true)}>New message</button></div>}</main>
    {page && active ? <aside className="messaging-details"><header><span className="messaging-avatar">{conversationName(active, currentUserId).charAt(0)}</span><strong>{conversationName(active, currentUserId)}</strong><small>{active.type === 'DIRECT' ? 'Direct message' : 'Team channel'}</small></header><section><h3>Conversation</h3><dl><div><dt>Members</dt><dd>{active.members.length}</dd></div><div><dt>Notifications</dt><dd>{active.membership.notificationLevel === 'MUTED' ? 'Muted' : active.membership.notificationLevel === 'MENTIONS' ? 'Mentions only' : 'All messages'}</dd></div><div><dt>Status</dt><dd>{active.membership.isPinned ? 'Pinned' : 'Active'}</dd></div></dl></section><section><h3>People</h3>{active.members.map((member) => <div key={member.userId} className="messaging-details__person"><span className="messaging-avatar">{initials(member.user)}</span><span><strong>{personName(member.user)}</strong><small>{ROLE_LABELS[member.user.role]}</small></span></div>)}</section></aside> : null}
    {newMessage ? <div className="messaging-picker" role="dialog" aria-modal="true" aria-label="New message"><header><div><strong>New message</strong><span>Active staff at this clinic</span></div><button onClick={() => setNewMessage(false)} aria-label="Close">×</button></header><label className="messaging-search"><span>⌕</span><input autoFocus placeholder="Search staff" onChange={(event) => void api(`directory?search=${encodeURIComponent(event.target.value)}`).then(setStaff)} /></label><div>{staff.map((person) => <button key={person.id} onClick={() => void beginDirect(person)}><span className="messaging-avatar" style={{ background: person.staffProfile?.color ?? undefined }}>{initials(person)}</span><span><strong>{personName(person)}</strong><small>{person.staffProfile?.jobTitle ?? ROLE_LABELS[person.role] ?? person.role}{person.locations[0] ? ` · ${person.locations[0].name}` : ''}</small></span></button>)}</div></div> : null}
    {error ? <div className="messaging-toast" role="alert">{error}<button onClick={() => setError(null)}>×</button></div> : null}
  </>;

  return page ? <div className="messaging-page-workspace">{content}</div> : <section className="messaging-drawer" aria-label="Messaging drawer">{content}</section>;
}

function MessageHistory({ messages, currentUserId }: { messages: StaffMessage[]; currentUserId: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);
  let priorDate = '';
  return <div className="messaging-history" aria-live="polite">{messages.map((message, index) => {
    const date = new Date(message.createdAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const separator = date !== priorDate; priorDate = date;
    const own = message.senderId === currentUserId;
    const grouped = index > 0 && messages[index - 1]?.senderId === message.senderId && !separator;
    return <div key={message.id}>{separator ? <div className="messaging-date"><span>{date}</span></div> : null}<article className={`messaging-message${own ? ' messaging-message--own' : ''}${grouped ? ' messaging-message--grouped' : ''}`}>{!own && !grouped ? <span className="messaging-avatar">{initials(message.sender)}</span> : <span/>}<div>{!grouped ? <header><strong>{own ? 'You' : personName(message.sender)}</strong><small>{ROLE_LABELS[message.sender.role]} · {messageTime(message.createdAt)}{message.editedAt ? ' · edited' : ''}</small></header> : null}{message.replyTo ? <blockquote><strong>{personName(message.replyTo.sender)}</strong>{message.replyTo.body}</blockquote> : null}<div className="messaging-bubble">{message.deletedAt ? <em>Message removed</em> : message.body}{message.attachments.map((attachment) => attachment.href ? <Link key={attachment.id} href={attachment.href} target={attachment.recordType ? undefined : '_blank'} className="messaging-record-card"><span>{attachment.recordType?.replace('_', ' ') ?? 'Attachment'}</span><strong>{attachment.previewLabel ?? attachment.fileName}</strong><small>{attachment.previewDetail ?? (attachment.sizeBytes ? `${Math.ceil(attachment.sizeBytes / 1024)} KB` : 'Open file')}</small></Link> : null)}</div>{message.reactions.length ? <div className="messaging-reactions">{Array.from(new Set(message.reactions.map((reaction) => reaction.emoji))).map((emoji) => <span key={emoji}>{emoji} {message.reactions.filter((reaction) => reaction.emoji === emoji).length}</span>)}</div> : null}</div></article></div>;
  })}<div ref={end}/></div>;
}

function MessageComposer({ conversation, suggestedContext, onRemoveContext, onSent }: { conversation: StaffConversation; suggestedContext: MessagingContext | null; onRemoveContext: () => void; onSent: () => Promise<void> }) {
  const [draft, setDraft] = useState(conversation.membership.draft);
  const [sending, setSending] = useState(false);
  const [tool, setTool] = useState<'mention' | 'emoji' | 'record' | null>(null);
  const [directory, setDirectory] = useState<MessagePerson[]>([]);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [recordQuery, setRecordQuery] = useState('');
  const [recordResults, setRecordResults] = useState<Array<{ id: string; name: string; species?: string; breed?: string }>>([]);
  const [linkedRecord, setLinkedRecord] = useState<MessagingContext | null>(null);
  const [attachments, setAttachments] = useState<Array<{ fileName: string; mimeType: string; sizeBytes: number; storageKey: string; href: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<number>();
  useEffect(() => { setDraft(conversation.membership.draft); }, [conversation.id, conversation.membership.draft]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function updateDraft(value: string) { setDraft(value); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { void api(`conversations/${conversation.id}/membership`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: value }) }); }, 500); }
  useEffect(() => { if (tool === 'mention' && directory.length === 0) void api('directory').then(setDirectory).catch(() => setToolError('Could not load staff.')); }, [tool, directory.length]);
  useEffect(() => { if (tool !== 'record' || recordQuery.trim().length < 2) { setRecordResults([]); return; } const wait = window.setTimeout(() => { fetch(`/api/patients/search?query=${encodeURIComponent(recordQuery.trim())}&limit=8`).then((response) => response.ok ? response.json() : []).then(setRecordResults).catch(() => setToolError('Could not search patients.')); }, 250); return () => window.clearTimeout(wait); }, [recordQuery, tool]);
  async function upload(file: File) { setUploading(true); setToolError(null); try { const form = new FormData(); form.set('file', file); const response = await fetch('/api/messaging/uploads', { method: 'POST', body: form }); const body = await response.json(); if (!response.ok) throw new Error(body.message ?? 'Upload failed.'); setAttachments((current) => [...current, body]); } catch (caught) { setToolError(caught instanceof Error ? caught.message : 'Upload failed.'); } finally { setUploading(false); } }
  function mention(person: MessagePerson) { const name = personName(person); updateDraft(`${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}@${name} `); setMentionIds((ids) => ids.includes(person.id) ? ids : [...ids, person.id]); setTool(null); }
  function emoji(value: string) { updateDraft(`${draft}${value}`); setTool(null); }
  async function send(event?: FormEvent) { event?.preventDefault(); const context = linkedRecord ?? suggestedContext; if ((!draft.trim() && !context && attachments.length === 0) || sending || uploading) return; setSending(true); setToolError(null); try { await api(`conversations/${conversation.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft, clientNonce: crypto.randomUUID(), mentionIds, linkedRecords: context ? [{ recordType: context.recordType, recordId: context.recordId }] : [], uploadedAttachments: attachments }) }); setDraft(''); setMentionIds([]); setAttachments([]); setLinkedRecord(null); await onSent(); } catch (caught) { setToolError(caught instanceof Error ? caught.message : 'Could not send message.'); } finally { setSending(false); } }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }
  const context = linkedRecord ?? suggestedContext;
  return <form className="messaging-composer" onSubmit={send}>{context ? <div className="messaging-context-suggestion"><span><small>Linked {context.recordType.toLowerCase().replace('_', ' ')}</small><strong>{context.label}</strong>{context.detail ? <em>{context.detail}</em> : null}</span><button type="button" onClick={() => { setLinkedRecord(null); onRemoveContext(); }} aria-label="Remove linked context">×</button></div> : null}{attachments.map((attachment, index) => <div key={attachment.storageKey} className="messaging-context-suggestion"><span><small>Attachment</small><strong>{attachment.fileName}</strong><em>{Math.ceil(attachment.sizeBytes / 1024)} KB</em></span><button type="button" onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${attachment.fileName}`}>×</button></div>)}<textarea value={draft} onChange={(event) => updateDraft(event.target.value)} onKeyDown={keyDown} rows={1} placeholder="Write a message…" aria-label="Message"/>{tool ? <div className="messaging-composer-tool">{tool === 'emoji' ? <div className="messaging-emoji-grid">{['👍','❤️','😊','🎉','✅','👀','🙏','🐾','💉','🩺'].map((value) => <button type="button" key={value} onClick={() => emoji(value)}>{value}</button>)}</div> : null}{tool === 'mention' ? <div className="messaging-tool-list">{directory.map((person) => <button type="button" key={person.id} onClick={() => mention(person)}><span className="messaging-avatar">{initials(person)}</span><span><strong>{personName(person)}</strong><small>{ROLE_LABELS[person.role]}</small></span></button>)}</div> : null}{tool === 'record' ? <div><label className="messaging-tool-search"><input autoFocus value={recordQuery} onChange={(event) => setRecordQuery(event.target.value)} placeholder="Search patients to link…"/></label><div className="messaging-tool-list">{recordResults.map((patient) => <button type="button" key={patient.id} onClick={() => { setLinkedRecord({ recordType: 'PATIENT', recordId: patient.id, label: patient.name, detail: [patient.species, patient.breed].filter(Boolean).join(' · ') }); setTool(null); }}><span className="messaging-avatar">{patient.name[0]}</span><span><strong>{patient.name}</strong><small>{[patient.species, patient.breed].filter(Boolean).join(' · ')}</small></span></button>)}</div></div> : null}</div> : null}{toolError ? <p className="messaging-composer-error" role="alert">{toolError}</p> : null}<div><div><input ref={fileInput} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }}/><button type="button" title="Attach file" aria-label="Attach file" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? '…' : '＋'}</button><button type="button" title="Mention staff" aria-label="Mention staff" aria-expanded={tool === 'mention'} onClick={() => setTool(tool === 'mention' ? null : 'mention')}>@</button><button type="button" title="Add emoji" aria-label="Add emoji" aria-expanded={tool === 'emoji'} onClick={() => setTool(tool === 'emoji' ? null : 'emoji')}>☺</button><button type="button" title="Link Sparki record" aria-label="Link Sparki record" aria-expanded={tool === 'record'} onClick={() => setTool(tool === 'record' ? null : 'record')}>↗</button></div><button className="messaging-send" disabled={(!draft.trim() && !context && attachments.length === 0) || sending || uploading}>{sending ? '…' : 'Send'}</button></div></form>;
}
