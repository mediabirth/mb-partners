import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import PageGuide from '@/components/PageGuide'
import { GUIDE_GROWTH } from '@/lib/console-guides'
import { redirect } from 'next/navigation'
import ConsoleNav from '@/components/ConsoleNav'
import {
  buildNorthStarSnapshot,
  formatMedianDays,
  formatSecondReferralRate,
  WON_EVENT_BODY,
  type NorthStarDeal,
  type NorthStarFunnelEvent,
  type NorthStarMail,
  type NorthStarPartner,
  type NorthStarWin,
  type PartnerStage,
} from '@/lib/north-star'
import { normalizeFunnelSource } from '@/lib/funnel-attribution'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: '.66rem', color: 'var(--muted2)', fontWeight: 500 }}>{label}</div>
      <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.5rem', fontWeight: 500, marginTop: 4, letterSpacing: '-.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// 通水P1: 紹介ファネル計測ダッシュボード（読み取り専用・お金/帰属非接触）。
//   funnel_events（share/landing_view/register）＋ deals ＋ partners を集計。転換率・休眠・パートナー別生産性。
export default async function GrowthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!prof || prof.role === 'partner' || prof.role === 'vendor') redirect('/console')

  const admin = await createServiceRoleClient()
  const [{ data: events }, { data: deals }, { data: partners }, { data: mailLogs }, { data: winEvents }] = await Promise.all([
    admin.from('funnel_events').select('event_type, channel, partner_id, src, created_at'),
    admin.from('deals').select('id, partner_id, channel, source, src, status, created_at'),
    admin.from('partners').select('id, code, is_frontier, is_system, supplier_rate_card, profiles(name, email)'),
    admin.from('mail_log').select('template_key, status, created_at').eq('template_key', 'weekly-digest'),
    admin.from('deal_events').select('created_at, deals!inner(partner_id)').eq('body', WON_EVENT_BODY),
  ])
  const ev = events ?? [], dl = deals ?? [], pt = partners ?? []

  const oneProfile = (value: unknown): { name?: string | null; email?: string | null } | null => {
    if (Array.isArray(value)) return value[0] ?? null
    return value && typeof value === 'object' ? value as { name?: string | null; email?: string | null } : null
  }
  const northPartners: NorthStarPartner[] = pt.map(partner => {
    const profile = oneProfile(partner.profiles)
    return { id: partner.id, code: partner.code, name: profile?.name ?? null, email: profile?.email ?? null, isSystem: partner.is_system }
  })
  const northDeals: NorthStarDeal[] = dl.map(deal => ({ partnerId: deal.partner_id, createdAt: deal.created_at, src: normalizeFunnelSource(deal.src) }))
  const northEvents: NorthStarFunnelEvent[] = ev.map(event => ({ eventType: event.event_type, partnerId: event.partner_id, createdAt: event.created_at, src: normalizeFunnelSource(event.src) }))
  const northMails: NorthStarMail[] = (mailLogs ?? []).map(row => ({ templateKey: row.template_key, status: row.status, createdAt: row.created_at }))
  const northWins: NorthStarWin[] = (winEvents ?? []).map(row => {
    const related = Array.isArray(row.deals) ? row.deals[0] : row.deals
    return { partnerId: related?.partner_id ?? null, createdAt: row.created_at }
  })
  const currentTime = new Date()
  const northStar = buildNorthStarSnapshot({ partners: northPartners, deals: northDeals, funnelEvents: northEvents, mails: northMails, wins: northWins, now: currentTime })

  const count = (t: string) => ev.filter(e => e.event_type === t).length
  const shares = count('share'), views = count('landing_view'), registers = count('register')
  const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 1000) / 10 : 0
  // 紹介deal（link/qr経由 or partner_form）
  const referralDeals = dl.filter(d => d.channel === 'referral' || d.channel === 'cooperation')
  const linkRegistered = dl.filter(d => d.source === 'link' || d.source === 'qr')
  const wonDeals = dl.filter(d => ['confirmed', 'paid'].includes(d.status))

  const nameById = Object.fromEntries(pt.map(p => [p.id, { name: oneProfile(p.profiles)?.name ?? '—', code: p.code, is_frontier: p.is_frontier }]))
  const now = currentTime.getTime()
  const perPartner = pt.map(p => {
    const pd = dl.filter(d => d.partner_id === p.id)
    const lastAt = pd.map(d => new Date(d.created_at).getTime()).sort((a, b) => b - a)[0] ?? null
    const dormantDays = lastAt ? Math.floor((now - lastAt) / 86_400_000) : null
    const pShares = ev.filter(e => e.event_type === 'share' && e.partner_id === p.id).length
    const pReg = ev.filter(e => e.event_type === 'register' && e.partner_id === p.id).length
    return { id: p.id, name: nameById[p.id]?.name, code: p.code, is_frontier: p.is_frontier, is_supplier: !!p.supplier_rate_card, deals: pd.length, won: pd.filter(d => ['confirmed', 'paid'].includes(d.status)).length, shares: pShares, reg: pReg, dormantDays }
  }).filter(p => p.code !== 'MBHOUSE').sort((a, b) => b.deals - a.deals)

  const dormant = perPartner.filter(p => p.dormantDays == null || p.dormantDays >= 14)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230, padding: '22px 24px 40px', maxWidth: 1080 + 230 }}>
      <p className="eyebrow" style={{ marginBottom: 2 }}>パートナー</p>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1.15rem', fontWeight: 500, marginBottom: 4 }}>成長（紹介）</h1><PageGuide data={GUIDE_GROWTH} /></span>
      <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginBottom: 18 }}>共有リンク経由の紹介の流れと、パートナー別の生産性・休眠を可視化します（読み取り専用）。</p>

      {/* GEN-4 North Star: 件数・日時のみを読む。money列は取得しない。 */}
      <section aria-labelledby="north-star-heading" style={{ marginBottom: 28 }}>
        <h2 id="north-star-heading" style={{ fontSize: '.9rem', fontWeight: 500, margin: '0 0 10px' }}>North Star</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
          <Stat label="2回目紹介率" value={formatSecondReferralRate(northStar)} sub="2回以上紹介した人 ÷ 1回以上紹介した人" />
          <Stat label="1→2回目の中央値" value={formatMedianDays(northStar.medianDaysToSecond)} sub="各パートナーの1件目から2件目まで" />
          <Stat label="紹介1回で止まっている人" value={`${northStar.stoppedAfterOne}人`} sub="次の一手を届けたい人数" />
        </div>

        <h3 style={{ fontSize: '.78rem', fontWeight: 500, margin: '22px 0 9px' }}>GENループ（直近8週・月曜始まり）</h3>
        <div className="ctable-scroll" style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.68rem', minWidth: 760 }}>
            <thead><tr style={{ color: 'var(--muted2)', textAlign: 'right' }}>
              {['週', 'ダイジェスト送信', 'ダイジェスト閲覧', 'カード閲覧', '共有操作', '起票', 'うち帰属あり', '成約'].map((heading, index) => (
                <th key={heading} style={{ padding: '9px 11px', fontWeight: 500, borderBottom: '0.5px solid var(--line)', textAlign: index === 0 ? 'left' : 'right' }}>{heading}</th>
              ))}
            </tr></thead>
            <tbody>{[...northStar.weeks].reverse().map(week => (
              <tr key={week.key}>
                {[week.label, week.digestSent, week.digestViews, week.cardViews, week.shares, week.referrals, week.attributedReferrals, week.wins].map((value, index) => (
                  <td key={index} className={index > 0 ? 'tnum' : undefined} style={{ padding: '9px 11px', borderBottom: '0.5px solid var(--line)', textAlign: index === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{value}</td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </div>

        <h3 style={{ fontSize: '.78rem', fontWeight: 500, margin: '22px 0 9px' }}>パートナー・ステージ</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
          {([
            ['none', '未紹介'],
            ['once', '1回'],
            ['repeat', '2回以上（リピーター）'],
          ] as const satisfies readonly (readonly [PartnerStage, string])[]).map(([stage, label]) => (
            <div key={stage} style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '11px 14px', borderBottom: '0.5px solid var(--line)', fontSize: '.72rem', fontWeight: 500 }}>{label} <span className="tnum" style={{ color: 'var(--muted2)', marginLeft: 5 }}>{northStar.stages[stage].length}人</span></div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {northStar.stages[stage].map(partner => (
                  <div key={partner.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, padding: '9px 14px', borderBottom: '0.5px solid var(--line)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '.69rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partner.name}</div>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 2 }}>{partner.code}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '.62rem', color: 'var(--muted2)' }}>
                      <div className="tnum">{partner.referrals}件</div>
                      <div>{partner.lastReferralAt ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(new Date(partner.lastReferralAt)) : '起票なし'}</div>
                    </div>
                  </div>
                ))}
                {northStar.stages[stage].length === 0 && <div style={{ padding: '16px 14px', color: 'var(--muted2)', fontSize: '.66rem' }}>該当者はいません</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ファネル */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 10 }}>
        <Stat label="共有（リンク発行/送付）" value={shares.toLocaleString()} />
        <Stat label="ランディング閲覧" value={views.toLocaleString()} sub={`共有→閲覧 ${pct(views, shares)}%`} />
        <Stat label="登録（リンク経由）" value={registers.toLocaleString()} sub={`閲覧→登録 ${pct(registers, views)}%`} />
        <Stat label="紹介案件（総数）" value={referralDeals.length.toLocaleString()} sub={`成約 ${wonDeals.length}件`} />
      </div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted)', margin: '4px 2px 22px', lineHeight: 1.6 }}>
        リンク経由の登録は {linkRegistered.length} 件。共有→登録の全体転換率 {pct(registers, shares)}%。（funnel_events はリンク共有・QR・LINE・コピー・ランディング閲覧・登録を記録）
      </p>

      {/* パートナー別生産性 */}
      <h2 style={{ fontSize: '.85rem', fontWeight: 500, margin: '4px 0 10px' }}>パートナー別の生産性</h2>
      <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem', minWidth: 560 }}>
          <thead>
            <tr style={{ color: 'var(--muted2)', textAlign: 'left' }}>
              {['パートナー', 'コード', '紹介', '成約', '共有', '登録', '最終活動'].map((h, i) => (
                <th key={h} style={{ padding: '10px 14px', fontWeight: 500, borderBottom: '0.5px solid var(--line)', textAlign: i >= 2 && i <= 5 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perPartner.map(p => (
              <tr key={p.id}>
                <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', fontWeight: 500 }}>{p.name}{p.is_frontier && <span style={{ fontSize: '.54rem', color: 'var(--c-blue)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '1px 7px', marginLeft: 6 }}>{p.is_supplier ? 'サプライヤー' : 'フロンティア'}</span>}</td>
                <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', color: 'var(--muted2)', fontFamily: 'Inter' }}>{p.code}</td>
                <td className="tnum" style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', textAlign: 'right', fontFamily: 'Inter' }}>{p.deals}</td>
                <td className="tnum" style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', textAlign: 'right', fontFamily: 'Inter', color: p.won > 0 ? 'var(--green)' : 'var(--muted)' }}>{p.won}</td>
                <td className="tnum" style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', textAlign: 'right', fontFamily: 'Inter' }}>{p.shares}</td>
                <td className="tnum" style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', textAlign: 'right', fontFamily: 'Inter' }}>{p.reg}</td>
                <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', color: (p.dormantDays == null || p.dormantDays >= 14) ? 'var(--amber)' : 'var(--muted2)' }}>{p.dormantDays == null ? '未活動' : p.dormantDays === 0 ? '今日' : `${p.dormantDays}日前`}</td>
              </tr>
            ))}
            {perPartner.length === 0 && <tr><td colSpan={7} style={{ padding: '20px 14px', color: 'var(--muted2)', textAlign: 'center' }}>データがありません</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 休眠 */}
      <h2 style={{ fontSize: '.85rem', fontWeight: 500, margin: '24px 0 10px' }}>休眠パートナー（14日以上 無活動）<span style={{ fontSize: '.66rem', color: 'var(--muted2)', fontWeight: 400, marginLeft: 8 }}>{dormant.length}名</span></h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {dormant.length === 0 ? <p style={{ fontSize: '.7rem', color: 'var(--muted2)' }}>休眠中のパートナーはいません。</p> : dormant.map(p => (
          <span key={p.id} style={{ fontSize: '.68rem', border: '0.5px solid var(--line)', borderRadius: 20, padding: '5px 12px', background: '#fff' }}>{p.name} <span style={{ color: 'var(--muted)' }}>· {p.dormantDays == null ? '未活動' : `${p.dormantDays}日`}</span></span>
        ))}
      </div>
      </div>
    </div>
  )
}
