import { hashPassword, verifyPassword } from '@/lib/password'

describe('scrypt password hashing', () => {
  it('round-trips a password', async () => {
    const stored = await hashPassword('correct horse 7 battery')
    expect(await verifyPassword('correct horse 7 battery', stored)).toBe(true)
  })

  it('stores self-describing scrypt format, never plaintext', async () => {
    const stored = await hashPassword('hunter2hunter2')
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
    expect(stored).not.toContain('hunter2')
  })

  it('produces unique salts per hash', async () => {
    const a = await hashPassword('same-password-1')
    const b = await hashPassword('same-password-1')
    expect(a).not.toEqual(b)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('rightpassword1')
    expect(await verifyPassword('wrongpassword1', stored)).toBe(false)
  })

  it('rejects malformed stored values without throwing', async () => {
    for (const bad of ['', 'plaintext', 'bcrypt$x$y', 'scrypt$16384$8$1$zz$zz', 'scrypt$0$8$1$aa$bb', 'scrypt$abc$8$1$aabb$ccdd']) {
      expect(await verifyPassword('whatever1', bad)).toBe(false)
    }
  })

  it('rejects oversized cost params immediately (no DoS via tampered row)', async () => {
    const start = Date.now()
    expect(await verifyPassword('whatever1', 'scrypt$1073741824$8$1$aabb$ccdd')).toBe(false)
    expect(await verifyPassword('whatever1', 'scrypt$16384$64$1$aabb$ccdd')).toBe(false)
    expect(await verifyPassword('whatever1', 'scrypt$16384$8$16$aabb$ccdd')).toBe(false)
    expect(Date.now() - start).toBeLessThan(500)
  })
})
