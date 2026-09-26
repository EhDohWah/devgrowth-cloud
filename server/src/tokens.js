import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, sent to the client exactly once. */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored, so a database leak does not leak usable tokens. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
