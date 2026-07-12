import PageGuide from '@/components/PageGuide'
import { GUIDE_MONITOR } from '@/lib/console-guides'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import ConsoleMain from '@/components/ConsolePageTransition'
import { TIER_INFO, CHECK_LABELS, tierOf, MONITOR_STALE_HOURS } from '@/lib/monitor-checks'

/**
 * 設定→監視（Feature M）。自己監視（/api/monitor Tier1/2/3）の現在状態を可視化する読み取り専用ページ。
 * Slackの日次ハートビートは廃止＝「監視自身の死」はこの画面の最終実行表示＋ダッシュボードの24hバナーが引き継ぐ。
 */
export const dynamic = 'force-dynamic'

const fmtJst = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default async function MonitorSettingsPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (!prof || prof.role === 'partner') redirect('/console')

  const admin = await createServiceRoleClient()
  const { data: stRaw } = await admin.from('monitor_state').select('check_key, fail_streak, alerting, last_ok, last_error, updated_at').order('check_key')
  const states = (stRaw ?? []) as { check_key: string; fail_streak: number; alerting: boolean; last_ok: string | null; last_error: string | null; updated_at: string }[]

  const byTier: Record<'t1' | 't2' | 't3', typeof states> = { t1: [], t2: [], t3: [] }
  for (const s of states) { const t = tierOf(s.check_key); if (t) byTier[t].push(s) }
  const lastRun = states.length ? states.map(s => s.updated_at).sort().at(-1)! : null
  const staleMs = MONITOR_STALE_HOURS * 3600 * 1000
  const isStale = !lastRun || Date.now() - new Date(lastRun).getTime() > staleMs

  const TH: React.CSSProperties = { textAlign: 'left', fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', padding: '8px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }
  const TD: React.CSSProperties = { fontSize: '.72rem', padding: '10px 12px', borderBottom: '0.5px solid var(--line)', verticalAlign: 'top' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <ConsoleMain>
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 30 }}>
          <Link href="/console/settings" style={{ color: 'var(--muted2)', textDecoration: 'none', fontSize: '.8rem' }}>← 設定</Link>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500 }}>監視</h1><PageGuide data={GUIDE_MONITOR} /></span>
        </div>

        <div style={{ padding: '24px 28px 44px', maxWidth: 900 }}>
          {/* 監視自身の生死（dead-man の可視化） */}
          <div style={{ background: isStale ? 'rgba(216,64,64,.08)' : '#fff', border: `0.5px solid ${isStale ? 'rgba(216,64,64,.4)' : 'var(--line)'}`, borderRadius: 14, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: isStale ? 'var(--red)' : '#0f9d76', flexShrink: 0 }} />
            <div style={{ fontSize: '.76rem' }}>
              <b>{isStale ? `監視が${MONITOR_STALE_HOURS}時間以上 実行されていません` : '監視は稼働中です'}</b>
              <span style={{ color: 'var(--muted2)', marginLeft: 10 }}>最終実行 {fmtJst(lastRun)} JST</span>
              {isStale && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>Vercel Cron（/api/monitor）の稼働・デプロイ状態を確認してください。</div>}
            </div>
          </div>

          {(['t1', 't2', 't3'] as const).map(t => {
            const rows = byTier[t]
            const tierLast = rows.length ? rows.map(r => r.updated_at).sort().at(-1) : null
            const red = rows.filter(r => r.fail_streak > 0)
            return (
              <div key={t} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <b style={{ fontSize: '.84rem' }}>{TIER_INFO[t].label}</b>
                  <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{TIER_INFO[t].cadence} ・ {TIER_INFO[t].desc}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '.62rem', fontWeight: 500, color: red.length ? 'var(--red)' : '#0f9d76' }}>{red.length ? `${red.length}件 異常` : '正常'}</span>
                  <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>最終実行 {fmtJst(tierLast)}</span>
                </div>
                <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                      <thead><tr><th style={TH}>チェック項目</th><th style={TH}>状態</th><th style={TH}>最終OK</th><th style={TH}>直近のエラー</th></tr></thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr><td style={{ ...TD, color: 'var(--muted2)' }} colSpan={4}>まだ実行記録がありません</td></tr>
                        ) : rows.map(r => (
                          <tr key={r.check_key}>
                            <td style={{ ...TD, fontWeight: 500 }}>{CHECK_LABELS[r.check_key] ?? r.check_key}<div style={{ fontSize: '.56rem', color: 'var(--muted)', fontFamily: 'Inter', marginTop: 2 }}>{r.check_key}</div></td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: r.fail_streak === 0 ? 'rgba(21,145,126,.12)' : 'rgba(216,64,64,.1)', color: r.fail_streak === 0 ? '#0f9d76' : 'var(--red)' }}>
                                {r.fail_streak === 0 ? 'OK' : r.alerting ? `異常（発報済み）` : `失敗${r.fail_streak}回目`}
                              </span>
                            </td>
                            <td style={{ ...TD, fontFamily: 'Inter', whiteSpace: 'nowrap', color: 'var(--muted2)' }}>{fmtJst(r.last_ok)}</td>
                            <td style={{ ...TD, color: 'var(--muted2)', maxWidth: 320 }}>{r.last_error ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })}

          <p style={{ fontSize: '.64rem', color: 'var(--muted2)', lineHeight: 1.8 }}>
            Slackへの連絡は「異常（2回連続失敗）」と「復旧」のみです。日次の「異常なし」ハートビートは廃止し、
            監視自身の生死はこの画面とダッシュボードの警告バナー（{MONITOR_STALE_HOURS}時間 無実行）が引き継いでいます。
          </p>
        </div>
      </ConsoleMain>
    </div>
  )
}
