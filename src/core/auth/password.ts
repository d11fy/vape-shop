import 'server-only';

import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/** `promisify` drops the options overload, so wrap it by hand. */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Password hashing with scrypt — a memory-hard KDF built into Node, so there is
 * no native module to compile and nothing to go stale.
 *
 * Stored format: `scrypt$N$r$p$saltB64$hashB64`
 * The cost parameters live inside the hash, so they can be raised later without
 * invalidating existing passwords: `needsRehash` tells the login flow when to
 * transparently upgrade a user on their next successful sign-in.
 */

const N = 2 ** 15; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelisation
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs roughly 128 · N · r bytes; give it headroom.
const MAX_MEM = 128 * N * R * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: Math.max(MAX_MEM, 128 * n * r * 2),
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when the stored hash uses weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < N || Number(parts[2]) < R;
}

// No 0/O, 1/l/I: the password is read aloud or copied off a screen at hand-off.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * A temporary password for someone else to hand over — a new employee, an
 * admin-initiated reset. 12 characters from a 56-symbol alphabet (~70 bits),
 * drawn with `randomInt` so there is no modulo bias, grouped in fours for
 * reading. Always pair it with `mustChangePassword: true`.
 */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let group = 0; group < 3; group += 1) {
    let chunk = '';
    for (let index = 0; index < 4; index += 1) {
      chunk += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    }
    groups.push(chunk);
  }
  return groups.join('-');
}

/**
 * The strength policy lives in `@/lib/password-strength` because the sign-up
 * form needs it in the browser and this module is server-only.
 */
export { checkPasswordStrength, type PasswordStrength } from '@/lib/password-strength';
