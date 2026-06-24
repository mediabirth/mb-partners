import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import ConsoleMain from '@/components/ConsolePageTransition'
import ReactivatePanel, { type DormantRow } from '@/components/ReactivatePanel'

// Wave2-②C：再活性化（休眠パートナー）パネル。休眠集計は read-only（deals/partners を読むだけ）。
// お金・status・confirmed・reward には一切触れない。
export const runtime = 'edge'

const DORMANT_DAYS = 30   // 直近30日 新規紹介ゼロ＝休眠
const COOLDOWN_DAYS = 14  // 同一partnerへの再送間隔（スパム防止）

export default async function ConsoleReactivatePage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const admin = await createServiceRoleClient()
  const now = Date.now()
  const cutoff = now - DORMANT_DAYS * 86_400_000

  // 紹介(referral)deal を partner別に集計（read-only）。
  const { data: refDeals } = await admin.from('deals').select('partner_id, created_at').eq('channel', 'referral').not('partner_id', 'is', null)
  const lastBy: Record<string, string> = {}
  const cntBy: Record<string, number> = {}
  for (const d of (refDeals ?? []) as Array<{ partner_id: string; created_at: string }>) {
    if (!lastBy[d.partner_id] || d.created_at > lastBy[d.partner_id]) lastBy[d.partner_id] = d.created_at
    cntBy[d.partner_id] = (cntBy[d.partner_id] ?? 0) + 1
  }
  // 休眠＝過去に紹介実績あり ＋ 最終紹介が DORMANT_DAYS より前。
  const dormantIds = Object.keys(lastBy).filter(pid => new Date(lastBy[pid]).getTime() < cutoff)

  let rows: DormantRow[] = []
  if (dormantIds.length) {
    const { data: partners } = await admin.from('partners').select('id, profile_id, status, is_system, last_nudged_at').in('id', dormantIds)
    const active = (partners ?? []).filter((p: { is_system?: boolean; status?: string }) => !p.is_system && p.status !== 'suspended') as Array<{ id: string; profile_id: string | null; last_nudged_at: string | null }>
    const profIds = active.map(p => p.profile_id).filter(Boolean) as string[]
    const ids = active.map(p => p.id)
    const [{ data: profs }, { data: lineLinks }, { data: pushSubs }] = await Promise.all([
      profIds.length ? admin.from('profiles').select('id, name').in('id', profIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ids.length ? admin.from('partner_line_links').select('partner_id').in('partner_id', ids) : Promise.resolve({ data: [] as { partner_id: string }[] }),
      ids.length ? admin.from('push_subscriptions').select('partner_id').eq('enabled', true).in('partner_id', ids) : Promise.resolve({ data: [] as { partner_id: string }[] }),
    ])
    const nameBy = Object.fromEntries((profs ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
    const lineSet = new Set((lineLinks ?? []).map((l: { partner_id: string }) => l.partner_id))
    const pushSet = new Set((pushSubs ?? []).map((s: { partner_id: string }) => s.partner_id))
    rows = active.map(p => ({
      id: p.id,
      name: (p.profile_id && nameBy[p.profile_id]) || 'パートナー',
      lastReferral: lastBy[p.id],
      dormantDays: Math.floor((now - new Date(lastBy[p.id]).getTime()) / 86_400_000),
      referrals: cntBy[p.id] ?? 0,
      lastNudgedAt: p.last_nudged_at,
      line: lineSet.has(p.id),
      push: pushSet.has(p.id),
    })).sort((a, b) => b.dormantDays - a.dormantDays)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <ConsoleMain>
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '-.01em' }}>再活性化</h1>
          <Link href="/console" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ fontSize: '.7rem', fontWeight: 700, padding: '7px 14px', textDecoration: 'none' }}>← ダッシュボード</Link>
        </div>
        <div style={{ padding: '30px 32px 44px', maxWidth: 880, margin: '0 auto' }}>
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 18 }}>
            過去に紹介実績があり、直近{DORMANT_DAYS}日 新規紹介が止まっているパートナーです。温かい一声で再開を後押しできます。
            <b>同一パートナーへは{COOLDOWN_DAYS}日に1回まで</b>（スパム防止・1人ずつ手動送信）。
          </p>
          <ReactivatePanel rows={rows} cooldownDays={COOLDOWN_DAYS} />
        </div>
      </ConsoleMain>
    </div>
  )
}
