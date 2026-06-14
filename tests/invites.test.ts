import {
  generateInviteToken,
  hashInviteToken,
  inviteStatus,
  usernameFromName,
  DEFAULT_INVITE_EXPIRY_DAYS,
} from '@/lib/invites'

describe('invite tokens', () => {
  it('generates a base64url token with matching sha256 hash', () => {
    const { token, tokenHash } = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes base64url
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInviteToken(token)).toBe(tokenHash)
  })

  it('generates unique tokens', () => {
    expect(generateInviteToken().token).not.toEqual(generateInviteToken().token)
  })
})

describe('inviteStatus', () => {
  const future = new Date(Date.now() + 86_400_000)
  const past = new Date(Date.now() - 86_400_000)

  it('pending when unused and unexpired', () => {
    expect(inviteStatus({ usedAt: null, expiresAt: future })).toBe('pending')
  })

  it('used wins over expiry', () => {
    expect(inviteStatus({ usedAt: past, expiresAt: past })).toBe('used')
  })

  it('expired when past expiresAt', () => {
    expect(inviteStatus({ usedAt: null, expiresAt: past })).toBe('expired')
  })
})

describe('usernameFromName', () => {
  it('slugifies display names to valid usernames', () => {
    expect(usernameFromName('Amirali T')).toBe('amirali-t')
    expect(usernameFromName('  Bob!! ')).toBe('bob')
    expect(usernameFromName('mr_under-score')).toBe('mr_under-score')
  })

  it('strips edge separators and returns empty string when nothing valid remains', () => {
    expect(usernameFromName('_edgy_')).toBe('edgy')
    expect(usernameFromName('!!!')).toBe('')
    expect(usernameFromName('')).toBe('')
  })
})

describe('DEFAULT_INVITE_EXPIRY_DAYS', () => {
  it('is 7', () => expect(DEFAULT_INVITE_EXPIRY_DAYS).toBe(7))
})
