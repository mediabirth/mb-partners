'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Identity = { id: string; name: string; email: string; color: string; role: string; avatar_url: string | null } | null
type Badges = { pendingPartners: number; openInquiries: number }

// 自分のプロフィール（表示名/色/アバター）編集後、ヘッダ等に即反映するための軽量パブサブ。
// money/権限には無関係＝表示用 identity のみ更新。
const identityListeners = new Set<() => void>()
export function updateConsoleIdentity(patch: Partial<NonNullable<Identity>>) {
  if (!cachedIdentity) return
  cachedIdentity = { ...cachedIdentity, ...patch }
  identityListeners.forEach(l => l())
}

// Module-level cache: survives ConsoleNav remounts on every page navigation so
// the admin identity is resolved exactly once per console session — no flash of
// a stale placeholder when navigating between pages.
let cachedIdentity: Identity = null
let cachedBadges: Badges | null = null
let inflight: Promise<void> | null = null
let badgesAt = 0  // 最終 badge 取得時刻。focus 復帰時に古い時だけ更新（継続ポーリングはしない・古い数字の貼り付き防止）。

const Ctx = createContext<{ identity: Identity; badges: Badges; ready: boolean }>({
  identity: null,
  badges: { pendingPartners: 0, openInquiries: 0 },
  ready: false,
})

export function useConsoleSession() {
  return useContext(Ctx)
}

export default function ConsoleSessionProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity>(cachedIdentity)
  const [badges, setBadges] = useState<Badges>(cachedBadges ?? { pendingPartners: 0, openInquiries: 0 })
  const [ready, setReady] = useState<boolean>(cachedIdentity !== null)

  useEffect(() => {
    if (cachedIdentity) {
      setIdentity(cachedIdentity)
      setBadges(cachedBadges ?? { pendingPartners: 0, openInquiries: 0 })
      setReady(true)
      return
    }
    let active = true
    const run =
      inflight ??
      (inflight = Promise.all([
        fetch('/api/console/me').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/console/badge-counts').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([me, b]) => {
        if (me?.id) {
          cachedIdentity = {
            id: me.id, name: me.name ?? '', email: me.email ?? '',
            color: me.color ?? '#4733E6', role: me.role ?? '', avatar_url: me.avatar_url ?? null,
          }
        }
        cachedBadges = {
          pendingPartners: b?.pendingPartners ?? 0,
          openInquiries: b?.openInquiries ?? 0,
        }
        badgesAt = Date.now()
      }))
    run.then(() => {
      if (!active) return
      setIdentity(cachedIdentity)
      setBadges(cachedBadges ?? { pendingPartners: 0, openInquiries: 0 })
      setReady(true)
    })
    return () => { active = false }
  }, [])

  // 自分のプロフィール編集の即時反映：updateConsoleIdentity 呼び出しで再描画。
  useEffect(() => {
    const l = () => setIdentity(cachedIdentity ? { ...cachedIdentity } : null)
    identityListeners.add(l)
    return () => { identityListeners.delete(l) }
  }, [])

  // C: タブ復帰時に badge が60秒以上古ければだけ再取得（承認待ち/問い合わせ件数の鮮度確保・継続ポーリング無し）。
  // identity は不変なので再取得しない。ナビ毎の再取得もしない（上の module cache）。
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - badgesAt < 60_000) return
      fetch('/api/console/badge-counts').then(r => (r.ok ? r.json() : null)).then(b => {
        if (!b) return
        cachedBadges = { pendingPartners: b.pendingPartners ?? 0, openInquiries: b.openInquiries ?? 0 }
        badgesAt = Date.now()
        setBadges(cachedBadges)
      }).catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return <Ctx.Provider value={{ identity, badges, ready }}>{children}</Ctx.Provider>
}
