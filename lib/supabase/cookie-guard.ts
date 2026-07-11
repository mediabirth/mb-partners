/**
 * ★セッション汚染の実行時強制（根絶第1層・2026-07-11）。
 * 「面×cookie名の許可表」: 各サーフェスは自分の auth cookie（mb-auth-<surface> とそのチャンク .0/.1…）しか書けない。
 * 許可表に無い auth cookie の書き込みは**その場で剥奪**（書かない）＋監査ログ。
 * Domain 属性つきの auth cookie（サブドメイン波及 .mb-partners.app 等）は host-only へ強制（Domain剥奪）＋監査ログ。
 * 適用点＝唯一の門（makeSurfaceServerClient / client.ts / proxy.ts の setAll）。eslint の @supabase/ssr 直接import封鎖と
 * 併せて、どんなコードが紛れ込んでも「別の面のセッションを書き換える」行為が通信層で成立しない。
 */
import { cookieNameFor, type Surface } from './surface'

export const AUTH_COOKIE_PREFIX = 'mb-auth'

type CookieOptions = { domain?: string; [k: string]: unknown }
export type CookieWrite = { name: string; value: string; options?: CookieOptions }

/** 当該サーフェスで許可される auth cookie 名か（本体＋チャンク .0/.1… のみ許可）。 */
export function isAllowedAuthCookie(surface: Surface, name: string): boolean {
  const allowed = cookieNameFor(surface)
  return name === allowed || name.startsWith(`${allowed}.`)
}

/** 監査ログ（Vercelログ＝運用が追跡可能。throwしない）。 */
function audit(kind: 'stripped' | 'domain-forced-host-only', surface: Surface, name: string, detail?: string) {
  console.error(`[auth-cookie-guard] ${kind}: surface=${surface} cookie=${name}${detail ? ` ${detail}` : ''}`)
}

/**
 * 書き込み列を検閲して返す（純関数）。
 * - auth cookie 以外（mb-auth* でないもの）は素通し。
 * - 許可表違反の auth cookie → 剥奪（結果から除外）。
 * - Domain 属性つき auth cookie → Domain を落として host-only 化。
 */
export function enforceAuthCookiePolicy(surface: Surface, writes: CookieWrite[]): CookieWrite[] {
  const out: CookieWrite[] = []
  for (const w of writes) {
    if (!w.name.startsWith(AUTH_COOKIE_PREFIX)) { out.push(w); continue }
    if (!isAllowedAuthCookie(surface, w.name)) { audit('stripped', surface, w.name); continue }
    if (w.options && typeof w.options.domain === 'string' && w.options.domain) {
      audit('domain-forced-host-only', surface, w.name, `domain=${w.options.domain}`)
      const { domain: _drop, ...rest } = w.options
      out.push({ ...w, options: rest })
      continue
    }
    out.push(w)
  }
  return out
}
