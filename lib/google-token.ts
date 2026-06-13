import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.GOOGLE_TOKEN_SECRET!, 'hex') // 32 bytes

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv(12) + tag(16) + ciphertext → base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptToken(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64')
  const iv  = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

export type StoredTokens = {
  access_token:  string   // encrypted
  refresh_token: string   // encrypted
  expires_at:    string   // ISO string
}

export function encryptTokens(tokens: {
  access_token: string
  refresh_token: string
  expires_at: Date | string
}): StoredTokens {
  return {
    access_token:  encryptToken(tokens.access_token),
    refresh_token: encryptToken(tokens.refresh_token),
    expires_at:    new Date(tokens.expires_at).toISOString(),
  }
}

export function decryptTokens(stored: StoredTokens) {
  return {
    access_token:  decryptToken(stored.access_token),
    refresh_token: decryptToken(stored.refresh_token),
    expires_at:    new Date(stored.expires_at),
  }
}
