import type { NextRequest } from 'next/server'

const WINDOW_MS = 5 * 60 * 1000
const MAX_REQUESTS = 5
const buckets = new Map<string, { startedAt: number; count: number }>()

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for')?.split(',')[0]
    ?? req.headers.get('x-real-ip')
    ?? 'unknown').trim()
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Serverless instance内のbest-effort制限。IPと対象キーの組合せで5分5回まで。 */
export async function takePublicFormLimit(
  req: NextRequest,
  target: string,
  now = Date.now(),
): Promise<{ allowed: boolean; remaining: number }> {
  const normalizedTarget = target.trim().toLowerCase()
  const key = await sha256(`${clientIp(req)}\0${normalizedTarget}`)
  const current = buckets.get(key)

  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 })
    return { allowed: true, remaining: MAX_REQUESTS - 1 }
  }

  current.count += 1
  if (buckets.size > 1_000) {
    for (const [candidate, bucket] of buckets) {
      if (now - bucket.startedAt >= WINDOW_MS) buckets.delete(candidate)
    }
  }
  return { allowed: current.count <= MAX_REQUESTS, remaining: Math.max(0, MAX_REQUESTS - current.count) }
}

export function isHoneypotFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function readBoundedString(
  body: Record<string, unknown>,
  key: string,
  max: number,
  options: { required?: boolean; normalizeEmail?: boolean } = {},
): { ok: true; value: string } | { ok: false } {
  const raw = body[key]
  if (raw == null && !options.required) return { ok: true, value: '' }
  if (typeof raw !== 'string') return { ok: false }
  const value = (options.normalizeEmail ? raw.toLowerCase() : raw).trim()
  if ((options.required && !value) || value.length > max) return { ok: false }
  return { ok: true, value }
}

export const PUBLIC_FORM_LIMIT = {
  windowMs: WINDOW_MS,
  maxRequests: MAX_REQUESTS,
} as const
