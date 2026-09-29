/** Frontend mirrors of the existing API contracts. The API remains authoritative. */
export type TeamRole = 'OWNER' | 'PRACTICE_MANAGER' | 'RECEPTIONIST' | 'VETERINARIAN' | 'TECHNICIAN' | 'ASSISTANT';
export const TEAM_ROLES: readonly TeamRole[] = ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'];
export const ROLE_LABELS: Record<TeamRole, string> = { OWNER: 'Owner', PRACTICE_MANAGER: 'Practice Manager', RECEPTIONIST: 'Receptionist', VETERINARIAN: 'Veterinarian', TECHNICIAN: 'Technician', ASSISTANT: 'Assistant' };
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
export interface BillingStatus { subscriptionStatus: SubscriptionStatus; isRestricted: boolean; currentPeriodEnd: string | null; planId: string | null }
export interface CheckoutStatus { status: 'pending' | 'provisioned' }
export interface ClinicProfile { id: string; name: string; legalName: string | null; phone: string | null; email: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; timezone: string | null; createdAt: string }
export interface OnboardingState { organizationId: string; clinicName: string; onboardingCompletedAt: string | null; step: 'CLINIC_DETAILS' | 'INVITE_TEAM' | 'COMPLETE'; pendingInvitationCount: number; teamMemberCount: number }
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export interface PublicInvitation { email: string; role: TeamRole; clinicName: string; isOwnerFounding: boolean; status: InvitationStatus; expiresAt: string }
export interface TeamInvitation { id: string; email: string; role: TeamRole; status: InvitationStatus; expiresAt: string; createdAt: string; invitedByUserId: string | null }
export interface BatchInvitationResult { email: string; success: boolean; invitation?: TeamInvitation; error?: string }
export interface TeamMember { membershipId: string; userId: string; firstName: string; lastName: string; displayName: string; email: string; role: TeamRole; status: 'ACTIVE' | 'DISABLED'; createdAt: string }
