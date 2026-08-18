/**
 * GEN-1「鼓動」: 週次パートナーダイジェストの純粋ロジック。
 * money値を受け取らない型と、生成後の境界検査で金額情報を構造的に遮断する。
 */
import crypto from 'node:crypto'
import { brandedEmailHtml, escapeHtml } from '@/lib/mail-render'
import { buildSocialProofCopy, type SocialProofCounts } from '@/lib/social-proof'

export const WEEKLY_DIGEST_TEMPLATE_KEY = 'weekly-digest'
export const HEARTBEAT_CATALOG_START = '2026-08-05T00:00:00.000Z'

export type DigestSegment = 'new' | 'active' | 'quiet'

export const DIGEST_SEGMENT_LABEL: Record<DigestSegment, string> = {
  new: '新規未紹介',
  active: '進行中あり',
  quiet: 'しばらく静か',
}

export type DigestTip = {
  id: string
  serviceId: string
  name: string
  shortDescription: string | null
  publishedAt: string
}

export type DigestState = {
  registeredAt: string
  totalDeals: number
  progressCount: number
  lastDealAt: string | null
}

export type DigestCopy = {
  subject: string
  text: string
  html: string
  segment: DigestSegment
  tip: DigestTip
}

const DAY = 24 * 60 * 60 * 1000
const MONEY_WORDS = /報酬|受注額|売上額|粗利|委託費|手数料|振込額|支払額|fee(?:_|-|\b)|amount/i
const MONEY_NUMBER = /[¥￥$€£]\s*\d|\d[\d,]*(?:\.\d+)?\s*(?:円|万円|億円|%)/i

function jstDate(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
}

/** ISO週キー。cronの業務日付に合わせてJSTで確定する。 */
export function digestWeekKey(date: Date): string {
  const d = jstDate(date)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / DAY) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function digestWeekStart(date: Date): Date {
  const d = jstDate(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return new Date(d.getTime() - 9 * 60 * 60 * 1000)
}

function hashIndex(partnerId: string, weekKey: string, size: number): number {
  const hex = crypto.createHash('sha256').update(`${partnerId}:${weekKey}`).digest('hex').slice(0, 12)
  return Number.parseInt(hex, 16) % size
}

/** 同じpartner+週は同一、候補が2件以上なら翌週は必ず別のネタ。 */
export function selectDigestTip(partnerId: string, date: Date, tips: DigestTip[]): DigestTip {
  if (tips.length === 0) throw new Error('weekly digest tip is required')
  const rawSelection = (target: Date) => {
    const weekStart = digestWeekStart(target).getTime()
    const newTips = tips.filter(t => {
      const publishedAt = new Date(t.publishedAt).getTime()
      return publishedAt >= weekStart && publishedAt < weekStart + 7 * DAY
    })
    const pool = newTips.length > 0 ? newTips : tips
    return { pool, index: hashIndex(partnerId, digestWeekKey(target), pool.length) }
  }
  const current = rawSelection(date)
  let selected = current.pool[current.index]
  if (current.pool.length > 1) {
    // 前週が「新着だけ」の別poolだった場合も、実際の前週選択と突合して連続を防ぐ。
    const previous = rawSelection(new Date(date.getTime() - 7 * DAY))
    if (selected.id === previous.pool[previous.index].id) {
      selected = current.pool[(current.index + 1) % current.pool.length]
    }
  }
  return selected
}

/** 設計§2.2の判定をそのまま適用。3分類に入らない直近起票者は今週は送らない。 */
export function classifyDigestSegment(state: DigestState, now: Date): DigestSegment | null {
  const age = now.getTime() - new Date(state.registeredAt).getTime()
  if (state.progressCount > 0) return 'active'
  if (age >= 7 * DAY && state.totalDeals === 0) return 'new'
  if (state.lastDealAt && now.getTime() - new Date(state.lastDealAt).getTime() >= 21 * DAY) return 'quiet'
  return null
}

export function isDigestExcludedIdentity(email: string, code?: string | null, name?: string | null): boolean {
  const normalizedEmail = email.trim().toLowerCase()
  const identity = `${normalizedEmail} ${(code ?? '').toLowerCase()} ${(name ?? '').toLowerCase()}`
  return normalizedEmail.endsWith('@mb-system.internal') || identity.includes('cc-monitor')
}

export function assertDigestBoundary(value: string): void {
  if (MONEY_WORDS.test(value) || MONEY_NUMBER.test(value)) {
    throw new Error('weekly digest money boundary violation')
  }
}

function safeTipText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim() || fallback
  try {
    assertDigestBoundary(text)
    return text
  } catch {
    return fallback
  }
}

const INTRO: Record<DigestSegment, string> = {
  new: '最初の一歩は、メニューを決めなくても大丈夫です。まずは「こんな相談があった」と教えてください。',
  active: 'ご紹介いただいた案件は、いまMB Partnersが進めています。次のご縁も、思い浮かんだ時にお知らせください。',
  quiet: 'ご無沙汰しています。今週は、会話のきっかけにしやすいメニューを1つお届けします。',
}

export function buildDigestCopy(params: {
  segment: DigestSegment
  displayName: string
  progressCount: number
  recentState: string | null
  unreadCount: number
  socialProof: SocialProofCounts
  tip: DigestTip
  tipUrl: string
  referUrl: string
  consultUrl: string
  unsubscribeUrl: string
}): DigestCopy {
  const subject = '【MB Partners】今週のご紹介ヒント'
  const tipName = safeTipText(params.tip.name, '今週のご紹介ヒント')
  const tipDescription = safeTipText(params.tip.shortDescription, '気になる方がいたら、会話のきっかけとしてお使いください。')
  const recent = params.recentState ?? 'まだありません'
  const socialProofLine = buildSocialProofCopy(params.socialProof, 7).digestLine
  const socialProofText = socialProofLine ? `\n\n${socialProofLine}` : ''
  const text = `${params.displayName} 様\n\n${INTRO[params.segment]}\n\nあなたの現在地\n・進行中 ${params.progressCount}件\n・直近の動き ${recent}\n・未読 ${params.unreadCount}件${socialProofText}\n\n今週のネタ\n${tipName}\n${tipDescription}\n${params.tipUrl}\n\n紹介する\n${params.referUrl}\n\nまず相談\n${params.consultUrl}\n\n週次ダイジェストを停止する\n${params.unsubscribeUrl}`

  // URLを除く可視文言を検査。件数と状態語の数字だけが許可され、money語・金額表現は通らない。
  assertDigestBoundary([subject, params.displayName, INTRO[params.segment], recent, socialProofLine ?? '', tipName, tipDescription].join('\n'))

  const html = brandedEmailHtml({
    blocksHtml: `
      <p style="margin:0 0 14px;font-size:14px">${escapeHtml(params.displayName)} 様</p>
      <p style="margin:0 0 18px;font-size:14px">${escapeHtml(INTRO[params.segment])}</p>
      <div style="background:#fff;border-radius:10px;padding:14px 16px;margin:0 0 18px">
        <p style="margin:0 0 7px;font-size:12px;color:#6E707D">あなたの現在地</p>
        <p style="margin:0;font-size:14px">進行中 ${params.progressCount}件 ・ 直近の動き ${escapeHtml(recent)} ・ 未読 ${params.unreadCount}件</p>
      </div>
      ${socialProofLine ? `<p style="margin:-7px 0 18px;font-size:13px;color:#474957">${escapeHtml(socialProofLine)}</p>` : ''}
      <p style="margin:0 0 5px;font-size:12px;color:#6E707D">今週のネタ</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:700">${escapeHtml(tipName)}</p>
      <p style="margin:0 0 16px;font-size:13px;color:#6E707D">${escapeHtml(tipDescription)}</p>
      <div style="margin:0 0 12px">
        <a href="${escapeHtml(params.tipUrl)}" style="display:inline-block;background:#0E0E14;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:9px;margin:0 8px 8px 0">このメニューを見る</a>
        <a href="${escapeHtml(params.referUrl)}" style="display:inline-block;background:#4733E6;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:9px;margin:0 8px 8px 0">紹介する</a>
        <a href="${escapeHtml(params.consultUrl)}" style="display:inline-block;border:1px solid #4733E6;color:#4733E6;text-decoration:none;font-weight:700;font-size:13px;padding:9px 18px;border-radius:9px;margin:0 0 8px">まず相談</a>
      </div>
      <p style="margin:16px 0 0;font-size:11px;color:#9A9CA8"><a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#6E707D">週次ダイジェストを停止する</a></p>`,
  })
  return { subject, text, html, segment: params.segment, tip: params.tip }
}

type UnsubscribePayload = { partnerId: string; exp: number }

export function signDigestUnsubscribe(partnerId: string, expiresAt: number, secret = process.env.CRON_SECRET ?? ''): string {
  if (!secret) throw new Error('CRON_SECRET not configured')
  const payload = Buffer.from(JSON.stringify({ partnerId, exp: expiresAt } satisfies UnsubscribePayload)).toString('base64url')
  const signature = crypto.createHmac('sha256', `weekly-digest:${secret}`).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyDigestUnsubscribe(token: string, now = Date.now(), secret = process.env.CRON_SECRET ?? ''): UnsubscribePayload | null {
  if (!secret) return null
  try {
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra) return null
    const expected = crypto.createHmac('sha256', `weekly-digest:${secret}`).update(payload).digest('base64url')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<UnsubscribePayload>
    if (typeof decoded.partnerId !== 'string' || typeof decoded.exp !== 'number' || decoded.exp < now) return null
    return { partnerId: decoded.partnerId, exp: decoded.exp }
  } catch {
    return null
  }
}
