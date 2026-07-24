import PageGuide from '@/components/PageGuide'
import { GUIDE_FUNNEL } from '@/lib/console-guides'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * 紹介ファネル（情報再構造化 2026-07-14）: 旧 /console/funnel の計測をダッシュボード常設セクションへ移設。
 * 読み取り集計のみ（funnel_events / deals(channel='referral')）・お金・statusは書かない（旧ページと同一計算）。
 */
const WINDOW_DAYS = 30

export default async function FunnelSection() {
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
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)
  const stages = [
    { label: '共有', n: shares, sub: 'メール/LINE/COPY/QR タップ', color: 'var(--c-blue)' },
    { label: 'ランディング閲覧', n: views, sub: '/r/ を開いた数', color: 'var(--blue-dk)', rate: pct(views, shares), rateLabel: '閲覧/共有' },
    { label: '送信', n: subs, sub: '紹介として登録', color: 'var(--amber)', rate: pct(subs, views), rateLabel: '送信/閲覧' },
    { label: '成約', n: confirmed, sub: 'うち成約確定', color: 'var(--green)', rate: pct(confirmed, subs), rateLabel: '成約/送信' },
  ]
  const byCh: Record<string, number> = { mail: 0, line: 0, copy: 0, qr: 0 }
  for (const r of (chR.data ?? []) as Array<{ channel: string | null }>) {
    if (r.channel && r.channel in byCh) byCh[r.channel]++
  }
  const CH_LABEL: Record<string, string> = { mail: 'メール', line: 'LINE', copy: 'COPY', qr: 'QR' }

  return (
    <div className="card-hover ui-card" style={{ background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <b style={{ fontSize: '.84rem' }}>紹介ファネル</b>
        <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>直近{WINDOW_DAYS}日</span>
        <PageGuide data={GUIDE_FUNNEL} />
      </div>
      <div className="ckanban console-funnel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {stages.map((s, i) => (
          <div key={s.label} style={{ background: 'var(--bg2)', borderRadius: 12, padding: '13px 15px' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500 }}>{i + 1}. {s.label}</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.4rem', fontWeight: 500, marginTop: 6, letterSpacing: '-.02em', color: s.color }}>{s.n}</div>
            <div style={{ fontSize: '.54rem', color: 'var(--muted2)', marginTop: 2, lineHeight: 1.4 }}>{s.sub}</div>
            {s.rate != null && (
              <div style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', marginTop: 7, paddingTop: 7, borderTop: '0.5px solid var(--line)' }}>
                {s.rateLabel} <b style={{ color: 'var(--txt)', fontFamily: 'Inter' }}>{s.rate}%</b>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        {Object.keys(CH_LABEL).map(k => (
          <span key={k} style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>
            {CH_LABEL[k]} <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--txt)' }}>{byCh[k]}</b>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '.56rem', color: 'var(--muted)' }}>共有チャネルの内訳（直近{WINDOW_DAYS}日）</span>
      </div>
    </div>
  )
}
