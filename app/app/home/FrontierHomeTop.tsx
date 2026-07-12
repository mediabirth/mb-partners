import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import FrontierInvite from '../frontier/FrontierInvite'

/**
 * ペルソナ・ホーム（フロンティア・非サプライヤー）: ホーム上部の「チーム」ヒーロー＋最優先アクション。
 * この下には従来の紹介ホーム本文がそのまま続く（自分の紹介も重要な仕事のため・リファラルホームは不変）。
 * 数字は支払と同一規則（lib/frontier.computeOverrides）＝ダッシュボード/支払明細と乖離しない。
 */
export default async function FrontierHomeTop() {
  const user = await getCachedUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, is_frontier').eq('profile_id', user.id).maybeSingle()
  if (!me?.is_frontier) return null
  const admin = await createServiceRoleClient()
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
  const { data: subs } = await admin.from('partners').select('id, frontier_id, frontier_linked_at').eq('frontier_id', me.id)
  const teamN = (subs ?? []).length
  let monthOverride = 0, activeSubs = 0
  if (teamN) {
    const subIds = (subs ?? []).map(s => s.id)
    const { data: deals } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', subIds)
    const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
    for (const s of subs ?? []) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
    const sf = await loadSupplierFrontiers(admin)
    monthOverride = computeOverrides((deals ?? []) as never, linkById, ym, sf)[me.id] ?? 0
    const activeIds = new Set((deals ?? []).filter(d => (d.status === 'confirmed' || d.status === 'paid') && ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym).map(d => d.partner_id))
    activeSubs = activeIds.size
  }

  return (
    <div>
      {/* 網ヒーロー（配下・今月の還元・実額） */}
      <div className="shine" style={{ margin: '18px 20px 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', color: '#fff', borderRadius: 18, padding: '20px 22px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: '.56rem', letterSpacing: '.22em', opacity: .85, textTransform: 'uppercase', marginBottom: 7 }}>あなたのチーム — 今月の還元</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '2rem', letterSpacing: '-.02em', lineHeight: 1.05 }}>
          <span style={{ fontSize: '.95rem', fontWeight: 500, opacity: .8, marginRight: 4 }}>¥</span><CountUp value={monthOverride} />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.28)' }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>配下<span className="tnum" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{teamN}名</span></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>今月稼働<span className="tnum" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{activeSubs}名</span></div>
          <a href="/app/frontier" style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: '.62rem', color: 'rgba(255,255,255,.9)', textDecoration: 'none' }}>チームの詳細 ›</a>
        </div>
      </div>
      {/* 最優先アクション: 仲間を招待（リンク共有） */}
      <div style={{ margin: '12px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 16px' }}>
        <div style={{ fontSize: '.74rem', fontWeight: 500, marginBottom: 8 }}>仲間を招待</div>
        <FrontierInvite />
      </div>
    </div>
  )
}
