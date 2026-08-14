'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  conversationName,
  personName,
  type MessagePerson,
  type StaffConversation,
  type StaffMessage,
} from '../lib/messaging-types';

const ROLES: Record<string, string> = {
  OWNER: 'Owner',
  PRACTICE_MANAGER: 'Practice Manager',
  RECEPTIONIST: 'Receptionist',
  VETERINARIAN: 'Veterinarian',
  TECHNICIAN: 'Technician',
  ASSISTANT: 'Assistant',
};
async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/messaging/${path}`, { cache: 'no-store', ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? String((body as { message: unknown }).message)
      : `Messaging request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}
const initials = (person: MessagePerson) =>
  `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`;
const avatar = (person: MessagePerson) => person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : initials(person);
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function TeamMessagesWorkspace({ currentUserId }: { currentUserId: string }) {
  const [conversations, setConversations] = useState<StaffConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [directsOpen, setDirectsOpen] = useState(true);
  const [navFilter, setNavFilter] = useState<'all' | 'unread'>('all');
  const [conversationSearch, setConversationSearch] = useState('');
  const [replyingTo, setReplyingTo] = useState<StaffMessage | null>(null);
  const [creatorMode, setCreatorMode] = useState<'channel' | 'direct' | null>(null);
  const [directory, setDirectory] = useState<MessagePerson[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [composerTool, setComposerTool] = useState<'mention' | 'emoji' | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<
    Array<{
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
    }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(
    () =>
      api<StaffConversation[]>(`conversations${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(
        (rows: StaffConversation[]) => {
          setConversations(rows);
          setActiveId((id) =>
            id && rows.some((row) => row.id === id) ? id : (rows[0]?.id ?? null),
          );
        },
      ),
    [search],
  );
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!activeId) return;
    void api<{ messages: StaffMessage[] }>(`conversations/${activeId}/messages`).then((body) =>
      setMessages(body.messages),
    );
    void api(`conversations/${activeId}/membership`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markRead: true }),
    });
  }, [activeId]);
  useEffect(() => {
    end.current?.scrollIntoView();
  }, [messages.length]);
  useEffect(() => {
    if (!composerTool && !reactionMessageId) return;

    function dismissOpenPicker(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const clickedComposerControl = target.closest(
        '.team-composer-popover, [aria-label="Mention staff"], [aria-label="Add emoji"]',
      );
      const clickedReactionControl = target.closest(
        '.team-reaction-picker, [aria-label="Add reaction"]',
      );

      if (composerTool && !clickedComposerControl) setComposerTool(null);
      if (reactionMessageId && !clickedReactionControl) setReactionMessageId(null);
    }

    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setComposerTool(null);
      setReactionMessageId(null);
    }

    document.addEventListener('pointerdown', dismissOpenPicker);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOpenPicker);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, [composerTool, reactionMessageId]);
  const active = conversations.find((row) => row.id === activeId) ?? null;
  const channels = useMemo(
    () => conversations.filter((row) => row.type !== 'DIRECT'),
    [conversations],
  );
  const directs = useMemo(
    () => conversations.filter((row) => row.type === 'DIRECT'),
    [conversations],
  );
  const unread = conversations.reduce((count, row) => count + row.unreadCount, 0);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || (!draft.trim() && attachments.length === 0)) return;
    setSending(true);
    try {
      await api(`conversations/${active.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: draft,
          clientNonce: crypto.randomUUID(),
          mentionIds,
          replyToId: replyingTo?.id,
          linkedRecords: [],
          uploadedAttachments: attachments.map(({ storageKey }) => ({ storageKey })),
        }),
      });
      setDraft('');
      setMentionIds([]);
      setAttachments([]);
      setComposerTool(null);
      setReplyingTo(null);
      const body = (await api(`conversations/${active.id}/messages`)) as {
        messages: StaffMessage[];
      };
      setMessages(body.messages);
      await load();
    } finally {
      setSending(false);
    }
  }
  async function uploadAttachment(file: File) {
    setUploading(true);
    setComposerError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/messaging/uploads', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'Upload failed.');
      setAttachments((current) => [...current, body]);
    } catch (caught) {
      setComposerError(caught instanceof Error ? caught.message : 'Could not upload this file.');
    } finally {
      setUploading(false);
    }
  }
  async function openComposerTool(tool: 'mention' | 'emoji') {
    setComposerTool((current) => (current === tool ? null : tool));
    if (tool === 'mention' && directory.length === 0) {
      try {
        setDirectory(await api<MessagePerson[]>('directory'));
      } catch {
        setComposerError('Could not load staff.');
      }
    }
  }
  function addMention(person: MessagePerson) {
    const label = personName(person);
    setDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${label} `);
    setMentionIds((current) => (current.includes(person.id) ? current : [...current, person.id]));
    setComposerTool(null);
  }
  function addEmoji(emoji: string) {
    setDraft((current) => `${current}${emoji}`);
    setComposerTool(null);
  }
  async function addReaction(messageId: string, emoji: string, remove = false) {
    await api(
      `messages/${messageId}/reactions${remove ? `/${encodeURIComponent(emoji)}` : ''}`,
      remove
        ? { method: 'DELETE' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji }),
          },
    );
    if (active) {
      const body = (await api(`conversations/${active.id}/messages`)) as {
        messages: StaffMessage[];
      };
      setMessages(body.messages);
    }
    setReactionMessageId(null);
  }
  async function openCreator(mode: 'channel' | 'direct') {
    setCreatorMode(mode);
    setSelectedIds([]);
    setChannelName('');
    setCreatorError(null);
    try {
      setDirectory(await api<MessagePerson[]>('directory'));
    } catch {
      setCreatorError('Could not load the staff directory.');
    }
  }
  async function createConversation(event: FormEvent) {
    event.preventDefault();
    if (!creatorMode) return;
    if (creatorMode === 'direct' && selectedIds.length !== 1) {
      setCreatorError('Choose one staff member.');
      return;
    }
    if (creatorMode === 'channel' && (!channelName.trim() || selectedIds.length === 0)) {
      setCreatorError('Enter a channel name and choose at least one member.');
      return;
    }
    setCreating(true);
    setCreatorError(null);
    try {
      const created = (await api('conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: creatorMode === 'direct' ? 'DIRECT' : 'PRIVATE_CHANNEL',
          name: creatorMode === 'channel' ? channelName.trim() : undefined,
          memberIds: selectedIds,
        }),
      })) as { id: string };
      setCreatorMode(null);
      await load();
      setActiveId(created.id);
    } catch {
      setCreatorError('Could not create this conversation.');
    } finally {
      setCreating(false);
    }
  }
  function item(conversation: StaffConversation, channel: boolean) {
    const other = conversation.members.find((member) => member.userId !== currentUserId)?.user;
    return (
      <button
        key={conversation.id}
        className={[
          'team-nav-item',
          activeId === conversation.id ? 'team-nav-item--active' : '',
          conversation.unreadCount ? 'team-nav-item--unread' : '',
          conversation.membership.notificationLevel === 'MUTED' ? 'team-nav-item--muted' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setActiveId(conversation.id)}
      >
        {channel ? (
          <span className="team-nav-item__channel">#</span>
        ) : (
          <span className="team-nav-item__avatar">{other ? avatar(other) : 'TM'}</span>
        )}
        <span>
          <strong>{conversationName(conversation, currentUserId)}</strong>
          <small>
            {conversation.messages[0]?.body || `${conversation.members.length} members`}
          </small>
        </span>
        {conversation.unreadCount ? <i>{conversation.unreadCount}</i> : null}
      </button>
    );
  }
  return (
    <div
      className={
        showDetails ? 'team-messages-page' : 'team-messages-page team-messages-page--details-hidden'
      }
    >
      <aside className="team-messages-nav">
        <header>
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>Clinic team</h2>
          </div>
          <button type="button" title="New channel" onClick={() => void openCreator('channel')}>
            ＋
          </button>
        </header>
        <label>
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search team messages"
          />
        </label>
        <div className="team-nav-filters" role="tablist" aria-label="Conversation filters">
          <button type="button" role="tab" aria-selected={navFilter === 'all'} onClick={() => setNavFilter('all')}>All</button>
          <button type="button" role="tab" aria-selected={navFilter === 'unread'} onClick={() => setNavFilter('unread')}>Unread {unread ? <span>{unread}</span> : null}</button>
        </div>
        <nav>
          <section>
            <div>
              <button type="button" className="team-nav-section-toggle" onClick={() => setChannelsOpen((value) => !value)} aria-expanded={channelsOpen}>
                <span>{channelsOpen ? '⌄' : '›'}</span><h3>Channels</h3>
              </button>
              <button
                type="button"
                aria-label="Create channel"
                onClick={() => void openCreator('channel')}
              >
                ＋
              </button>
            </div>
            {channelsOpen ? channels.filter((row) => navFilter === 'all' || row.unreadCount > 0).map((row) => item(row, true)) : null}
          </section>
          <section>
            <div>
              <button type="button" className="team-nav-section-toggle" onClick={() => setDirectsOpen((value) => !value)} aria-expanded={directsOpen}>
                <span>{directsOpen ? '⌄' : '›'}</span><h3>Direct messages</h3>
              </button>
              <button
                type="button"
                aria-label="Start direct message"
                onClick={() => void openCreator('direct')}
              >
                ＋
              </button>
            </div>
            {directsOpen ? directs.filter((row) => navFilter === 'all' || row.unreadCount > 0).map((row) => item(row, false)) : null}
          </section>
        </nav>
        <footer>
          <span className="team-online-dot" /> <span>Clinic team online</span>
        </footer>
      </aside>
      <main className="team-conversation">
        {active ? (
          <>
            <header>
              <div>
                <span
                  className={
                    active.type === 'DIRECT'
                      ? 'team-conversation__avatar'
                      : 'team-conversation__channel'
                  }
                >
                  {active.type === 'DIRECT'
                    ? conversationName(active, currentUserId).charAt(0)
                    : '#'}
                </span>
                <div>
                  <h2>{conversationName(active, currentUserId)}</h2>
                  <div className="team-header-participants" aria-label={`${active.members.length} participants`}>
                    <span className="team-avatar-stack">{active.members.slice(0, 3).map((member) => <i key={member.userId}>{avatar(member.user)}</i>)}</span>
                    <small>{active.type === 'DIRECT' ? 'Private conversation' : `${active.members.length} members`}</small>
                  </div>
                </div>
              </div>
              <div>
                <button
                  className={
                    showDetails
                      ? 'team-header-button team-header-button--active'
                      : 'team-header-button'
                  }
                  onClick={() => setShowDetails((value) => !value)}
                >
                  Details
                </button>
              </div>
            </header>
            <div className="team-message-timeline">
              {messages.filter((message) => !conversationSearch || message.body.toLowerCase().includes(conversationSearch.toLowerCase())).map((message, index, visibleMessages) => {
                const previous = visibleMessages[index - 1];
                const grouped = previous?.senderId === message.senderId && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
                const own = message.senderId === currentUserId;
                const messageDate = new Date(message.createdAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
                const previousVisible = visibleMessages[index - 1];
                const previousDate = previousVisible ? new Date(previousVisible.createdAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) : '';
                const showDate = messageDate !== previousDate;
                const showUnread = Boolean(active.membership.lastReadAt && new Date(message.createdAt) > new Date(active.membership.lastReadAt) && (!previousVisible || new Date(previousVisible.createdAt) <= new Date(active.membership.lastReadAt)));
                return (
                  <div key={message.id}>
                  {showDate ? <div className="team-date-divider"><span>{messageDate}</span></div> : null}
                  {showUnread ? <div className="team-new-divider"><span>New messages</span></div> : null}
                  <article
                    className={[
                      'team-timeline-message',
                      grouped ? 'team-timeline-message--grouped' : '',
                      own ? 'team-timeline-message--own' : 'team-timeline-message--other',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {grouped ? (
                      <span />
                    ) : (
                      <span
                        className="team-message-avatar"
                        style={{ background: message.sender.staffProfile?.color ?? undefined }}
                      >
                        {avatar(message.sender)}
                      </span>
                    )}
                    <div>
                      {grouped ? null : (
                        <header>
                          <strong>{own ? 'You' : personName(message.sender)}</strong>
                          <time>{time(message.createdAt)}</time>
                        </header>
                      )}
                      {message.replyTo ? <blockquote className="team-reply-quote"><strong>{personName(message.replyTo.sender)}</strong><span>{message.replyTo.body}</span></blockquote> : null}
                      <p>{message.deletedAt ? <em>Message removed</em> : message.body}</p>
                      <div className="team-message-actions" aria-label="Message actions">
                        <button type="button" title="Reply" onClick={() => setReplyingTo(message)}>↩</button>
                        <button type="button" title="Add reaction" aria-label="Add reaction" onClick={() => setReactionMessageId((current) => current === message.id ? null : message.id)}>☺</button>
                        {own ? <button type="button" title="Edit">✎</button> : null}
                        <button type="button" title="Save">⌖</button><button type="button" title="More options">•••</button>
                        {reactionMessageId === message.id ? (
                          <div className="team-reaction-picker" role="menu" aria-label="Choose a reaction">
                            {['👍', '❤️', '😂', '🎉', '✅', '👀', '🙏', '🐾'].map((emoji) => (
                              <button type="button" role="menuitem" key={emoji} onClick={() => void addReaction(message.id, emoji)}>{emoji}</button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {message.attachments.map((attachment) => (
                        <Link
                          key={attachment.id}
                          href={attachment.href ?? '#'}
                          className="team-linked-record"
                        >
                          <span>{attachment.recordType ?? 'Attachment'}</span>
                          <strong>{attachment.previewLabel ?? attachment.fileName}</strong>
                          <small>{attachment.previewDetail}</small>
                        </Link>
                      ))}
                      <div className="team-message-reactions">
                        {Array.from(
                          new Set(message.reactions.map((reaction) => reaction.emoji)),
                        ).map((emoji) => {
                          const reactions = message.reactions.filter(
                            (reaction) => reaction.emoji === emoji,
                          );
                          const mine = reactions.some(
                            (reaction) => reaction.userId === currentUserId,
                          );
                          return (
                            <button
                              type="button"
                              key={emoji}
                              className={
                                mine ? 'team-reaction team-reaction--mine' : 'team-reaction'
                              }
                              onClick={() => void addReaction(message.id, emoji, mine)}
                            >
                              {emoji} <span>{reactions.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                  </div>
                );
              })}
              <div ref={end} />
            </div>
            <form className="team-page-composer" onSubmit={send}>
              {replyingTo ? <div className="team-reply-context"><span><small>Replying to {replyingTo.senderId === currentUserId ? 'yourself' : personName(replyingTo.sender)}</small><strong>{replyingTo.body}</strong></span><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">×</button></div> : null}
              {attachments.map((attachment, index) => (
                <div className="team-composer-attachment" key={attachment.storageKey}>
                  <span>
                    <strong>{attachment.fileName}</strong>
                    <small>{Math.ceil(attachment.sizeBytes / 1024)} KB</small>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label={`Remove ${attachment.fileName}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {composerTool === 'emoji' ? (
                <div className="team-composer-popover team-composer-emojis">
                  {['👍', '❤️', '😊', '😂', '🎉', '✅', '👀', '🙏', '🐾', '💉', '🩺', '✨'].map(
                    (emoji) => (
                      <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>
                        {emoji}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
              {composerTool === 'mention' ? (
                <div className="team-composer-popover team-composer-mentions">
                  {directory.map((person) => (
                    <button type="button" key={person.id} onClick={() => addMention(person)}>
                      <span className="team-message-avatar">{avatar(person)}</span>
                      <span>
                        <strong>{personName(person)}</strong>
                        <small>{ROLES[person.role] ?? person.role}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {composerError ? (
                <p className="team-composer-error" role="alert">
                  {composerError}
                </p>
              ) : null}
              <div>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Message ${active.type === 'DIRECT' ? conversationName(active, currentUserId) : `#${conversationName(active, currentUserId)}`}`}
                  rows={2}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
                  onInput={(event) => { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`; }}
                />
                <button
                  disabled={(!draft.trim() && attachments.length === 0) || sending || uploading}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              <footer>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAttachment(file);
                    event.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  aria-label="Attach file"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? '…' : '＋'}
                </button>
                <button
                  type="button"
                  aria-label="Mention staff"
                  aria-expanded={composerTool === 'mention'}
                  onClick={() => void openComposerTool('mention')}
                >
                  @
                </button>
                <button
                  type="button"
                  aria-label="Add emoji"
                  aria-expanded={composerTool === 'emoji'}
                  onClick={() => void openComposerTool('emoji')}
                >
                  ☺
                </button>
                <small>Enter to send · Shift + Enter for a new line</small>
              </footer>
            </form>
          </>
        ) : (
          <div className="team-page-empty">Select a channel or direct message</div>
        )}
      </main>
      {active && showDetails ? (
        <aside className="team-context-panel">
          <header>
            <div><span className="eyebrow">Channel details</span><h2>{conversationName(active, currentUserId)}</h2></div>
            <button type="button" onClick={() => setShowDetails(false)} aria-label="Close details">×</button>
          </header>
          <section>
            <h3>Description</h3>
            <p>
              {active.type === 'DIRECT'
                ? 'A private internal conversation. Messages are never copied into a patient medical record.'
                : 'A shared space for clinic coordination and operational handoffs.'}
            </p>
          </section>
          <section className="team-detail-controls">
            <label><span>Notifications</span><select value={active.membership.notificationLevel} onChange={(event) => void api(`conversations/${active.id}/membership`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationLevel: event.target.value }) }).then(load)}><option value="ALL">All messages</option><option value="MENTIONS">Mentions only</option><option value="MUTED">Muted</option></select></label>
            <label><span>Search conversation</span><input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search messages…" /></label>
          </section>
          <section><button className="team-resource-row"><span>⌖</span><div><strong>Pinned messages</strong><small>Review saved clinical handoffs</small></div></button><button className="team-resource-row"><span>↗</span><div><strong>Shared files</strong><small>{messages.reduce((count, message) => count + message.attachments.length, 0)} files and attachments</small></div></button></section>
          <section>
            <div className="team-context-heading">
              <h3>Members</h3>
              <button type="button" onClick={() => void openCreator('channel')}>Add members</button>
            </div>
            {active.members.map((member) => (
              <div className="team-context-person" key={member.userId}>
                <span>{avatar(member.user)}</span>
                <div>
                  <strong>{personName(member.user)}</strong>
                  <small>{member.user.statusEmoji ? `${member.user.statusEmoji} ${member.user.statusText ?? ''}` : ROLES[member.user.role]}</small>
                </div>
                <i className="team-online-dot" />
              </div>
            ))}
          </section>
          <section className="team-danger-actions"><button type="button" onClick={() => void api(`conversations/${active.id}/membership`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isArchived: true }) }).then(load)}>Archive channel</button><button type="button">Leave channel</button>{active.members.some((member) => member.userId === currentUserId && ['OWNER','PRACTICE_MANAGER'].includes(member.user.role)) ? <button type="button">Manage channel</button> : null}</section>
        </aside>
      ) : null}
      {creatorMode ? (
        <div
          className="team-creator-backdrop"
          role="presentation"
          onMouseDown={() => setCreatorMode(null)}
        >
          <form
            className="team-creator"
            role="dialog"
            aria-modal="true"
            aria-label={creatorMode === 'channel' ? 'Create channel' : 'Start direct message'}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={createConversation}
          >
            <header>
              <div>
                <span className="eyebrow">Team Messages</span>
                <h2>{creatorMode === 'channel' ? 'Create a channel' : 'Start a direct message'}</h2>
                <p>
                  {creatorMode === 'channel'
                    ? 'Bring the right clinic team together in a focused space.'
                    : 'Choose one active staff member to message privately.'}
                </p>
              </div>
              <button type="button" onClick={() => setCreatorMode(null)} aria-label="Close">
                ×
              </button>
            </header>
            {creatorMode === 'channel' ? (
              <label className="team-creator__name">
                <span>Channel name</span>
                <div>
                  <strong>#</strong>
                  <input
                    autoFocus
                    value={channelName}
                    onChange={(event) => setChannelName(event.target.value)}
                    placeholder="e.g. Surgery handoffs"
                    maxLength={120}
                  />
                </div>
              </label>
            ) : null}
            <fieldset>
              <legend>{creatorMode === 'channel' ? 'Add members' : 'Choose a teammate'}</legend>
              <div className="team-creator__people">
                {directory.map((person) => {
                  const checked = selectedIds.includes(person.id);
                  return (
                    <label
                      key={person.id}
                      className={
                        checked
                          ? 'team-creator__person team-creator__person--selected'
                          : 'team-creator__person'
                      }
                    >
                      <input
                        type={creatorMode === 'direct' ? 'radio' : 'checkbox'}
                        name="staff-member"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedIds(
                            creatorMode === 'direct'
                              ? [person.id]
                              : event.target.checked
                                ? [...selectedIds, person.id]
                                : selectedIds.filter((id) => id !== person.id),
                          )
                        }
                      />
                      <span className="team-message-avatar">{initials(person)}</span>
                      <span>
                        <strong>{personName(person)}</strong>
                        <small>{ROLES[person.role] ?? person.role}</small>
                      </span>
                      <i>{checked ? '✓' : ''}</i>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {creatorError ? (
              <p className="team-creator__error" role="alert">
                {creatorError}
              </p>
            ) : null}
            <footer>
              <button type="button" onClick={() => setCreatorMode(null)}>
                Cancel
              </button>
              <button className="team-creator__primary" disabled={creating}>
                {creating
                  ? 'Creating…'
                  : creatorMode === 'channel'
                    ? 'Create channel'
                    : 'Start message'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
