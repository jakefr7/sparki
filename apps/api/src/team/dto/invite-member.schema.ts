import { z } from 'zod';

/** Staff-invitable roles — excludes CLIENT (a patient-owner identity, never
 *  a clinic team member). Whether the acting user may actually grant OWNER
 *  is a separate, actor-dependent check in TeamService.invite, not
 *  expressible in this schema. */
export const INVITABLE_ROLES = [
  'OWNER',
  'PRACTICE_MANAGER',
  'RECEPTIONIST',
  'VETERINARIAN',
  'TECHNICIAN',
  'ASSISTANT',
] as const;

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(INVITABLE_ROLES),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/** Step 3 of /setup ("invite your team") accepts several rows at once. */
export const inviteMembersBatchSchema = z.object({
  invitations: z.array(inviteMemberSchema).min(1).max(25),
});

export type InviteMembersBatchInput = z.infer<typeof inviteMembersBatchSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(INVITABLE_ROLES),
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
