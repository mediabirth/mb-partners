'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Identity = { id: string; name: string; email: string; color: string; role: string } | null
type Badges = { pendingPartners: number; openInquiries: number }

// Module-level cache: survives ConsoleNav remounts on every page navigation so
// the admin identity is resolved exactly once per console session — no flash of
// a stale placeholder when navigating between pages.
let cachedIdentity: Identity = null
let cachedBadges: Badges | null = null
let inflight: Promise<void> | null = null

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
            color: me.color ?? '#4733E6', role: me.role ?? '',
          }
        }
        cachedBadges = {
          pendingPartners: b?.pendingPartners ?? 0,
          openInquiries: b?.openInquiries ?? 0,
        }
      }))
    run.then(() => {
      if (!active) return
      setIdentity(cachedIdentity)
      setBadges(cachedBadges ?? { pendingPartners: 0, openInquiries: 0 })
      setReady(true)
    })
    return () => { active = false }
  }, [])

  return <Ctx.Provider value={{ identity, badges, ready }}>{children}</Ctx.Provider>
}
