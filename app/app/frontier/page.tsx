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

  // 前月比（既存 deals から先月の override を表示用に集計・式は既存と同一・money計算/payout に非接触）。
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastYm = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`
  let lastMonthOverride = 0
  for (const d of deals) {
    const linkedAt = linkedAtById[d.partner_id!]
    const ref = d.fixed_month ?? d.created_at
    if (dealMonth(d) === lastYm && linkedAt && withinWindow(linkedAt, ref)) lastMonthOverride += Math.round(d.amount * OVERRIDE_RATE)
  }
  const momDelta = monthOverride - lastMonthOverride

  // ★表示専用の見込み試算（あくまでイメージ・実際の payout / オーバーライド確定額には一切影響しない）。
  //   平均成約額：チーム実績があればそれ、無ければ説明用サンプル。式＝人数×平均×率（既存 OVERRIDE_RATE 流用）。
  const SAMPLE_DEAL = 100_000
  const teamGross = Object.values(perSub).reduce((s, p) => s + p.gross, 0)
  const teamCount = Object.values(perSub).reduce((s, p) => s + p.count, 0)
  const avgDeal = teamCount > 0 ? Math.round(teamGross / teamCount) : SAMPLE_DEAL
  const teamN = subList.length
  const projFull = Math.round(teamN * avgDeal * OVERRIDE_RATE)                 // 今のチームがフル稼働した月見込み
  const milestoneTarget = teamN < 3 ? 3 : teamN < 5 ? 5 : teamN < 10 ? 10 : teamN < 20 ? 20 : teamN + 10
  const milestoneNeed = Math.max(0, milestoneTarget - teamN)
  const milestoneIncome = Math.round(milestoneTarget * avgDeal * OVERRIDE_RATE)
  const milestonePct = milestoneTarget > 0 ? Math.min(100, Math.round((teamN / milestoneTarget) * 100)) : 0
  const ratePct = Math.round(OVERRIDE_RATE * 100)
  const ZERO_INVITE = 5
  const zeroProj = Math.round(ZERO_INVITE * SAMPLE_DEAL * OVERRIDE_RATE)

  // 出し分け：チーム0〜1名 かつ 収入0 ＝ ゼロ状態UI。
  const isZero = teamN <= 1 && monthOverride === 0

  // ── ゼロ状態 ───────────────────────────────────────────────
  if (isZero) {
    return (
      <div className="page-anim" style={{ paddingBottom: 8 }}>
        {/* ① ヒーロー：これから育つ */}
        <div className="shine" style={{ margin: '18px 20px 0', background: '#1B1A17', color: '#fff', borderRadius: 18, padding: '22px 22px 18px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -50, top: -50, width: 180, height: 180, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,.14)', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', inset: 30, border: '1.5px solid rgba(255,255,255,.2)', borderRadius: '50%' }} />
          </div>
          <div style={{ fontSize: '.92rem', fontWeight: 500, letterSpacing: '-.01em', position: 'relative' }}>チームの成果は、ここから積み上がります</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10, position: 'relative' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '2.1rem', letterSpacing: '-.02em' }}>¥0</span>
            <span style={{ fontSize: '.66rem', opacity: .85 }}>まずは仲間の招待から</span>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative' }}>
            <div style={{ fontSize: '.6rem', opacity: .85 }}>チーム<span style={{ fontWeight: 500, display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{teamN}名</span></div>
            <div style={{ fontSize: '.6rem', opacity: .85 }}>今月稼働<span style={{ fontWeight: 500, display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{activeSubs}名</span></div>
            <div style={{ fontSize: '.6rem', opacity: .85 }}>次の節目<span style={{ fontWeight: 500, display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{milestoneTarget}名</span></div>
          </div>
        </div>

        {/* ② オーバーライドの仕組み */}
        <div style={{ margin: '16px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
          <div style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--c-blue)', letterSpacing: '.06em', marginBottom: 7 }}>オーバーライドとは</div>
          <p style={{ fontSize: '.74rem', lineHeight: 1.7, margin: 0 }}>
            あなたが招待した仲間が成約すると、その<span style={{ fontWeight: 500 }}>{ratePct}%</span>が<span style={{ fontWeight: 500 }}>12ヶ月間</span>あなたのオーバーライド収入になります。
          </p>
          <div style={{ marginTop: 12, background: 'var(--blue-bg2)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '.7rem', lineHeight: 1.6 }}>
              例えば <span style={{ fontWeight: 500 }}>{ZERO_INVITE}名</span>招いてフル稼働なら、月 <span className="tnum" style={{ fontWeight: 500, color: 'var(--c-blue)', fontFamily: 'Inter' }}>¥{zeroProj.toLocaleString()}</span> の見込み
              <span style={{ display: 'block', fontSize: '.54rem', color: 'var(--muted2)', marginTop: 2 }}>※ イメージの試算です</span>
            </div>
          </div>
        </div>

        {/* ③ 最初の一歩（3ステップ・2,3は薄く） */}
        <div style={{ padding: '20px 20px 6px' }}>
          <h2 style={{ fontSize: '.82rem', fontWeight: 500, marginBottom: 12 }}>最初の一歩</h2>
          {[
            { n: 1, t: '最初の仲間を招待する', s: '下のボタンから招待リンクを送るだけ', active: true },
            { n: 2, t: '仲間が成約する', s: `成約額の${ratePct}%があなたの収入に`, active: false },
            { n: 3, t: 'チームを育てる', s: '仲間が増えるほど収入が積み上がる', active: false },
          ].map(step => (
            <div key={step.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 0', opacity: step.active ? 1 : .45 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: step.active ? 'var(--c-blue)' : 'var(--bg2)', color: step.active ? '#fff' : 'var(--muted2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 500, fontFamily: 'Inter' }}>{step.n}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 500 }}>{step.t}</div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2 }}>{step.s}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ④ 招待CTA */}
        <div style={{ padding: '8px 20px 6px' }}>
          <div style={{ fontSize: '.74rem', fontWeight: 500, textAlign: 'center', marginBottom: 10 }}>最初の仲間を招待しませんか</div>
          <FrontierInvite />
        </div>
        <div style={{ height: 16 }} />
      </div>
    )
  }

  // ── 数字入り（アクティブ）状態 ─────────────────────────────
  return (
    <div className="page-anim" style={{ paddingBottom: 8 }}>
      {/* ① 収入ヒーロー：今月のオーバーライド収入＋前月比＋3指標 */}
      <div className="shine" style={{ margin: '18px 20px 0', background: '#1B1A17', color: '#fff', borderRadius: 18, padding: '22px 22px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -50, top: -50, width: 180, height: 180, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,.14)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', inset: 30, border: '1.5px solid rgba(255,255,255,.2)', borderRadius: '50%' }} />
        </div>
        <div style={{ fontSize: '.56rem', letterSpacing: '.22em', opacity: .85, textTransform: 'uppercase', marginBottom: 7, position: 'relative' }}>今月のオーバーライド収入</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '2.3rem', letterSpacing: '-.02em', lineHeight: 1.05, position: 'relative' }}>
          <span style={{ fontSize: '1rem', fontWeight: 500, opacity: .8, marginRight: 4 }}>¥</span><CountUp value={monthOverride} />
        </div>
        {/* 前月比（先月データがある時のみ・トレンドアイコン） */}
        {(lastMonthOverride > 0 || momDelta !== 0) && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: '.66rem', background: 'rgba(255,255,255,.16)', borderRadius: 4, padding: '3px 10px', position: 'relative' }}>
            先月より {momDelta >= 0 ? '+' : '−'}¥{Math.abs(momDelta).toLocaleString()}
          </div>
        )}
        <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative' }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>チーム<span style={{ fontWeight: 500, display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{teamN}名</span></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>今月稼働<span style={{ fontWeight: 500, display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{activeSubs}名</span></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>稼働率<span style={{ fontWeight: 500, display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{utilization}%</span></div>
        </div>
      </div>

      {/* ② 次のマイルストーン */}
      {milestoneNeed > 0 && (
        <div style={{ margin: '14px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 500 }}>あと<span style={{ color: 'var(--c-blue)' }}>{milestoneNeed}名</span>で 月<span className="tnum" style={{ color: 'var(--c-blue)', fontFamily: 'Inter' }}>¥{milestoneIncome.toLocaleString()}</span></div>
            <span style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>見込み</span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden', margin: '10px 0 6px' }}>
            <div className="bar-grow" style={{ width: `${milestonePct}%`, height: '100%', borderRadius: 99, background: 'var(--c-blue)' }} />
          </div>
          <div style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>チーム {teamN}名 → 目標 {milestoneTarget}名</div>
        </div>
      )}

      {/* ③ フル稼働したら */}
      <div style={{ margin: '14px 20px 0', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '.72rem', lineHeight: 1.6 }}>
          今のチーム <span style={{ fontWeight: 500 }}>{teamN}名</span> が毎月成約すると、月 <span className="tnum" style={{ fontWeight: 500, color: 'var(--c-blue)', fontFamily: 'Inter' }}>¥{projFull.toLocaleString()}</span> のオーバーライド見込み
          <span style={{ display: 'block', fontSize: '.54rem', color: 'var(--muted2)', marginTop: 2 }}>※ イメージの試算です</span>
        </div>
      </div>

      {/* ④ あなたのチーム（メンバーカード） */}
      <div style={{ padding: '22px 20px 6px' }}>
        <h2 style={{ fontSize: '.92rem', fontWeight: 500, marginBottom: 12 }}>あなたのチーム</h2>
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {subList.map(s => {
            const st = perSub[s.id] ?? { override: 0, count: 0, gross: 0 }
            const status = st.count >= 2 ? { t: '活発', c: 'var(--green)' }
              : st.count === 1 ? { t: '順調', c: 'var(--c-blue)' }
              : { t: 'これから', c: 'var(--muted2)' }
            return (
              <div key={s.id} className="card-hover ui-card" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '13px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: (s as any).profiles?.color ?? 'var(--c-blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.78rem', fontWeight: 500, flexShrink: 0 }}>
                    {((s as any).profiles?.name ?? s.code)[0]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(s as any).profiles?.name ?? s.code}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: '.54rem', fontWeight: 500, color: 'var(--muted2)' }}>
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: status.c, flexShrink: 0 }} />
                      {status.t}・今月成約 {st.count}件
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '.92rem', color: 'var(--c-blue)' }}>＋¥{st.override.toLocaleString()}</div>
                    <div style={{ fontSize: '.54rem', color: 'var(--muted2)' }}>貢献額</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ⑤ 招待CTA */}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 16px', textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 500, marginBottom: 3 }}>チームの成約が、あなたの報酬になります</div>
          <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 12 }}>新しい仲間の成約 {ratePct}% が 12ヶ月あなたの収入に</div>
          <FrontierInvite />
        </div>
      </div>
      <div style={{ height: 16 }} />
    </div>
  )
}
