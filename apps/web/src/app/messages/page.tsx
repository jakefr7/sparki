'use client';

import { DashboardShell } from '../../components/dashboard-shell';
import { TeamMessagesWorkspace } from '../../components/team-messages-workspace';
import { useCurrentUser } from '../../lib/use-current-user';

export default function MessagesPage() {
  const { user, loading } = useCurrentUser();
  return <DashboardShell workspace activeHref="/messages" eyebrow="Internal collaboration" title="Team Messages" subtitle="Coordinate handoffs, channels, and clinic work with your team.">
    {loading ? <div className="messaging-page-loading">Loading messages…</div> : user ? <TeamMessagesWorkspace currentUserId={user.id} /> : <div className="messaging-page-loading">Sign in to view messages.</div>}
  </DashboardShell>;
}
