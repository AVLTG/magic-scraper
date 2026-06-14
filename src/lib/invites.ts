// Invite token helpers — Node runtime only (uses node:crypto).
import { randomBytes, createHash } from 'node:crypto'

export const DEFAULT_INVITE_EXPIRY_DAYS = 7
export const MAX_INVITE_EXPIRY_DAYS = 30

// Raw token goes in the link (shown once); only its sha256 is stored.
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type InviteStatus = 'pending' | 'used' | 'expired'

export function inviteStatus(
  invite: { usedAt: Date | null; expiresAt: Date },
  now: Date = new Date()
): InviteStatus {
  if (invite.usedAt) return 'used'
  if (invite.expiresAt < now) return 'expired'
  return 'pending'
}

// Bound invites lock the username to the collection user's display name,
// slugified to the username charset (lowercase [a-z0-9_-]) — must stay
// compatible with usernameSchema in authValidators.ts.
// Returns '' when no valid characters remain — callers must validate the
// result (e.g. against usernameSchema) before storing it.
export function usernameFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
}
