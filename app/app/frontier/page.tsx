import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import FrontierInvite from './FrontierInvite'
import { OVERRIDE_RATE, withinWindow, dealMonth } from '@/lib/frontier'

export const runtime = 'edge'

export default async function FrontierPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const { data: me } = await supabase.from('partners').select('id, is_frontier').eq('profile_id', user.id).single()
  if (!me) redirect('/app')
  if (!me.is_frontier) redirect('/app')  // フロンティアのみ

  const admin = await createServiceRoleClient()
  // チームのパートナー（frontier_id = 自分）
  const { data: subs } = await admin
    .from('partners')
    .select('id, code, frontier_linked_at, profiles(name, color)')
    .eq('frontier_id', me.id)
  const subList = subs ?? []
  const subIds = subList.map(s => s.id)

  // チームの確定/支払 deal
  let deals: any[] = []
  if (subIds.length) {
    const { data } = await admin
      .from('deals')
      .select('partner_id, amount, status, fixed_month, created_at')
      .in('partner_id', subIds)
      .or('status.eq.confirmed,status.eq.paid')
    deals = data ?? []
  }

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const linkedAtById: Record<string, string | null> = {}
  for (const s of subList) linkedAtById[s.id] = s.frontier_linked_at

  // パートナー別の今月override + 件数
  const perSub: Record<string, { override: number; count: number; gross: number }> = {}
  let monthOverride = 0
  for (const d of deals) {
    const linkedAt = linkedAtById[d.partner_id!]
    const ref = d.fixed_month ?? d.created_at
    const inWindow = linkedAt ? withinWindow(linkedAt, ref) : false
    const ent = (perSub[d.partner_id!] ??= { override: 0, count: 0, gross: 0 })
    if (dealMonth(d) === ym) {
      ent.count += 1; ent.gross += d.amount
      if (inWindow) { const ov = Math.round(d.amount * OVERRIDE_RATE); ent.override += ov; monthOverride += ov }
    }
  }

  // KPI
  const activeSubs = Object.values(perSub).filter(p => p.count > 0).length
  const utilization = subList.length ? Math.round((activeSubs / subList.length) * 100) : 0
  const newThisMonth = subList.filter(s => (s.frontier_linked_at ?? '').slice(0, 7) === ym).length
  const mvp = subList
    .map(s => ({ s, ...(perSub[s.id] ?? { override: 0, count: 0, gross: 0 }) }))
    .sort((a, b) => b.gross - a.gross)[0]

  return (
    <div className="page-anim" style={{ paddingBottom: 8 }}>
      {/* Hero: 今月のオーバーライド */}
      <div className="shine" style={{ margin: '18px 20px 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', color: '#fff', borderRadius: 18, padding: '22px 22px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: '.56rem', letterSpacing: '.22em', opacity: .85, textTransform: 'uppercase', marginBottom: 7 }}>今月のオーバーライド</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.3rem', letterSpacing: '-.02em', lineHeight: 1.05 }}>
          <span style={{ fontSize: '1rem', fontWeight: 600, opacity: .8, marginRight: 4 }}>¥</span><CountUp value={monthOverride} />
        </div>
        <div style={{ fontSize: '.64rem', opacity: .85, marginTop: 8 }}>あなたのチーム {subList.length}名・今月稼働 {activeSubs}名（チーム成約の{Math.round(OVERRIDE_RATE * 100)}%）</div>
      </div>

      {/* KPI */}
      <div className="stagger" style={{ display: 'flex', gap: 10, margin: '14px 20px 0' }}>
        <Kpi label="チーム" value={subList.length} unit="名" />
        <Kpi label="稼働率" value={utilization} unit="%" />
        <Kpi label="今月新規" value={newThisMonth} unit="名" />
      </div>

      {/* MVP */}
      {mvp && mvp.gross > 0 && (
        <div style={{ margin: '14px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {/* MVP スパーク（単色フラット） */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 L14.6 9.4 L22 12 L14.6 14.6 L12 22 L9.4 14.6 L2 12 L9.4 9.4 Z" fill="var(--c-blue)"/>
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700 }}>今月のMVPパートナー</div>
            <div style={{ fontSize: '.82rem', fontWeight: 800 }}>{(mvp.s as any).profiles?.name ?? mvp.s.code}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.95rem' }}>¥{mvp.gross.toLocaleString()}</div>
            <div style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>成約 {mvp.count}件</div>
          </div>
        </div>
      )}

      {/* チームカード */}
      <div style={{ padding: '22px 20px 6px' }}>
        <h2 style={{ fontSize: '.92rem', fontWeight: 800, marginBottom: 12 }}>あなたのチーム</h2>
        {subList.length === 0 ? (
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 14 }}>まだパートナーがいません。下の招待リンクから仲間を増やしましょう。</p>
        ) : (
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {subList.map(s => {
              const st = perSub[s.id] ?? { override: 0, count: 0, gross: 0 }
              const linkedAt = s.frontier_linked_at
              const expired = linkedAt ? !withinWindow(linkedAt, now.toISOString()) : true
              return (
                <div key={s.id} className="card-hover ui-card" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '13px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: (s as any).profiles?.color ?? 'var(--c-blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.74rem', fontWeight: 700, flexShrink: 0 }}>
                      {((s as any).profiles?.name ?? s.code)[0]}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(s as any).profiles?.name ?? s.code}</div>
                      <div style={{ fontSize: '.58rem', color: expired ? 'var(--muted2)' : 'var(--green)', marginTop: 1 }}>{expired ? '対象期間外' : 'オーバーライド対象'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.92rem', color: 'var(--c-blue)' }}>＋¥{st.override.toLocaleString()}</div>
                      <div style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>今月成約 {st.count}件</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <FrontierInvite />
      </div>
      <div style={{ height: 16 }} />
    </div>
  )
}

function Kpi({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="card-hover ui-card" style={{ flex: 1, background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '12px 12px' }}>
      <div style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.2rem', marginTop: 3 }}>
        <CountUp value={value} /><small style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', marginLeft: 2 }}>{unit}</small>
      </div>
    </div>
  )
}
