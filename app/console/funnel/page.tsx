import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import ConsoleMain from '@/components/ConsolePageTransition'

// Wave1-⑤：紹介ファネル計測ビュー（additive・読み取り集計のみ）。
// 共有/閲覧=funnel_events、送信/成約=deals(channel='referral') を“読み取るだけ”。お金・statusは書かない。
export const runtime = 'edge'

const WINDOW_DAYS = 30

export default async function ConsoleFunnelPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const admin = await createServiceRoleClient()
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

  const cnt = (res: { count: number | null }) => res.count ?? 0
  const [sharesR, viewsR, subsR, confR, chR] = await Promise.all([
    admin.from('funnel_events').select('id', { count: 'exact', head: true }).eq('event_type', 'share').gte('created_at', since),
    admin.from('funnel_events').select('id', { count: 'exact', head: true }).eq('event_type', 'landing_view').gte('created_at', since),
    admin.from('deals').select('id', { count: 'exact', head: true }).eq('channel', 'referral').gte('created_at', since),
    admin.from('deals').select('id', { count: 'exact', head: true }).eq('channel', 'referral').eq('status', 'confirmed').gte('created_at', since),
    admin.from('funnel_events').select('channel').eq('event_type', 'share').gte('created_at', since),
  ])
  const shares = cnt(sharesR), views = cnt(viewsR), subs = cnt(subsR), confirmed = cnt(confR)

  // 各段間の転換率（分母0は—）。
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)
  const stages = [
    { label: '共有', n: shares, sub: 'メール/LINE/COPY/QR タップ', color: 'var(--blue)' },
    { label: 'ランディング閲覧', n: views, sub: '/r/ を開いた数', color: 'var(--blue-dk)', rate: pct(views, shares), rateLabel: '閲覧/共有' },
    { label: '送信', n: subs, sub: '紹介として登録', color: 'var(--amber)', rate: pct(subs, views), rateLabel: '送信/閲覧' },
    { label: '成約', n: confirmed, sub: 'うち成約確定', color: 'var(--green)', rate: pct(confirmed, subs), rateLabel: '成約/送信' },
  ]

  // チャネル別 共有数。
  const byCh: Record<string, number> = { mail: 0, line: 0, copy: 0, qr: 0 }
  for (const r of (chR.data ?? []) as Array<{ channel: string | null }>) {
    if (r.channel && r.channel in byCh) byCh[r.channel]++
  }
  const CH_LABEL: Record<string, string> = { mail: 'メール', line: 'LINE', copy: 'COPY', qr: 'QR' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <ConsoleMain>
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '-.01em' }}>紹介ファネル</h1>
          <Link href="/console" className="btn btn-g" style={{ fontSize: '.7rem', fontWeight: 700, padding: '7px 14px', textDecoration: 'none' }}>← ダッシュボード</Link>
        </div>

        <div style={{ padding: '30px 32px 44px', maxWidth: 1000, margin: '0 auto' }}>
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 18 }}>
            共有 → ランディング閲覧 → 送信 → 成約 の各段（直近{WINDOW_DAYS}日）。計測の“器”を用意した段階のため、共有/閲覧は今後データが貯まると増えます（現状は小さな数字です）。
          </p>

          {/* 4段 KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {stages.map((s, i) => (
              <div key={s.label} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700 }}>{i + 1}. {s.label}</div>
                <div style={{ fontFamily: 'Inter', fontSize: '1.7rem', fontWeight: 800, marginTop: 8, letterSpacing: '-.02em', color: s.color }}>{s.n}</div>
                <div style={{ fontSize: '.56rem', color: 'var(--muted2)', marginTop: 3, lineHeight: 1.4 }}>{s.sub}</div>
                {s.rate != null && (
                  <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--muted2)', marginTop: 8, paddingTop: 8, borderTop: '1px solid #F2F2F6' }}>
                    {s.rateLabel} <b style={{ color: 'var(--txt)', fontFamily: 'Inter' }}>{s.rate}%</b>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* チャネル別 共有 */}
          <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
            <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>共有チャネルの内訳</b>
            <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 14 }}>直近{WINDOW_DAYS}日の共有タップ数</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {Object.keys(CH_LABEL).map(k => (
                <div key={k} style={{ background: 'var(--bg2)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Inter', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-.02em' }}>{byCh[k]}</div>
                  <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 4, fontWeight: 600 }}>{CH_LABEL[k]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ConsoleMain>
    </div>
  )
}
