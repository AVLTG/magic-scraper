import { z } from 'zod'

// Policy (confirmed 2026-06-12): min 8, ≥1 letter, ≥1 digit, ≤128,
// not a common password, not equal to the username.
const COMMON_PASSWORDS = new Set([
  'password1', 'password123', 'p@ssw0rd', 'passw0rd', 'password2024', 'password2025',
  'qwerty123', 'qwerty1234', 'q1w2e3r4', '1q2w3e4r', 'qwe123qwe',
  'abc12345', 'abcd1234', 'a1b2c3d4', '12345678a', '123456789a',
  'iloveyou1', 'welcome1', 'welcome123', 'admin123', 'letmein1',
  'monkey123', 'dragon123', 'master123', 'shadow123', 'superman1',
  'batman123', 'trustno1', 'sunshine1', 'princess1', 'football1',
  'baseball1', 'soccer123', 'hockey123', 'jordan23x', 'michael1',
  'charlie1', 'jessica1', 'daniel123', 'mustang1', 'access123',
  'hello123', 'freedom1', 'whatever1', 'ninja123', 'azerty123',
  'zaq12wsx', '1qaz2wsx', 'qazwsx123', 'pass1234', 'test1234',
  'magic1234', 'tabletally1', 'mtg12345', 'commander1',
])

export type PasswordCheck = { ok: true } | { ok: false; message: string }

export function validatePassword(password: string, username?: string): PasswordCheck {
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters' }
  if (password.length > 128) return { ok: false, message: 'Password must be at most 128 characters' }
  if (!/[a-zA-Z]/.test(password)) return { ok: false, message: 'Password must contain at least one letter' }
  if (!/[0-9]/.test(password)) return { ok: false, message: 'Password must contain at least one number' }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, message: 'That password is too common — pick something less guessable' }
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return { ok: false, message: 'Password must not be the same as your username' }
  }
  return { ok: true }
}

// Stored lowercase; login lowercases input before lookup.
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, underscore and hyphen')
  .transform((v) => v.toLowerCase())
