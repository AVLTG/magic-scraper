import { validatePassword, usernameSchema } from '@/lib/authValidators'

describe('validatePassword', () => {
  it('accepts a compliant password', () => {
    expect(validatePassword('blueDragon42')).toEqual({ ok: true })
  })

  it('rejects fewer than 8 chars', () => {
    const r = validatePassword('abc123')
    expect(r.ok).toBe(false)
  })

  it('rejects more than 128 chars (exact boundary)', () => {
    expect(validatePassword('a1' + 'x'.repeat(126)).ok).toBe(true) // 128 chars
    expect(validatePassword('a1' + 'x'.repeat(127)).ok).toBe(false) // 129 chars
  })

  it('rejects passwords without a letter', () => {
    expect(validatePassword('12345678!').ok).toBe(false)
  })

  it('rejects passwords without a digit', () => {
    expect(validatePassword('justletters!').ok).toBe(false)
  })

  it('rejects common passwords (case-insensitive)', () => {
    expect(validatePassword('Password1').ok).toBe(false)
    expect(validatePassword('qwerty123').ok).toBe(false)
  })

  it('rejects password equal to username (case-insensitive, both directions)', () => {
    expect(validatePassword('Amirali99', 'amirali99').ok).toBe(false)
    expect(validatePassword('amirali99', 'AMIRALI99').ok).toBe(false)
  })

  it('returns a human-readable message on failure', () => {
    const r = validatePassword('short1')
    expect(r.ok).toBe(false)
    expect((r as { ok: false; message: string }).message).toMatch(/8 characters/)
  })
})

describe('usernameSchema', () => {
  it('accepts and lowercases valid usernames', () => {
    expect(usernameSchema.parse('  Some_User-1 ')).toBe('some_user-1')
  })

  it('rejects invalid charset, too-short and too-long', () => {
    for (const bad of ['ab', 'has space', 'emoji😀', 'x'.repeat(33), 'semi;colon']) {
      expect(usernameSchema.safeParse(bad).success).toBe(false)
    }
  })
})
