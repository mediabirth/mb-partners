import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import { customerHonorific } from '@/lib/customer'
import ServiceAvatar from '@/components/ServiceAvatar'
import ChannelMark from '@/components/ChannelMark'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済', lost: '不成立',
}
// ⑥ 段階ステッパー（4段）
const RAIL_STEPS = ['受付', '対応中', '成約', '支払済']
const STATUS_STEP: Record<string, number> = {
  received: 0, in_progress: 1, confirmed: 2, paid: 3,
}

// Wave2-②A：パートナー視点の段階ラベル（既存 status を“読み取って”表示するだけ・status値/遷移/お金は不変更）。
const PARTNER_STAGE: Record<string, string> = {
  received: '受付', in_progress: 'MB対応中', confirmed: '成約', paid: '成約（入金済）', lost: '見送り',
}
function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()}`
}

// 4段ステッパー（旧実装の段階表示に回帰）。完了段は塗り、現在段は強調。
function StatusStepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 12 }}>
      {RAIL_STEPS.map((label, i) => {
        const done = i <= step
        const isCurrent = i === step
        const color = i === 3 && done ? 'var(--green)' : 'var(--blue)'
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {/* connector to previous node */}
            {i > 0 && (
              <span style={{ position: 'absolute', top: 6, right: '50%', width: '100%', height: 2, background: i <= step ? color : 'var(--line)' }} />
            )}
            <span style={{
              position: 'relative', zIndex: 1, width: isCurrent ? 14 : 12, height: isCurrent ? 14 : 12, borderRadius: '50%',
              background: done ? color : '#fff', border: `2px solid ${done ? color : 'var(--line)'}`,
              boxShadow: isCurrent ? `0 0 0 4px ${i === 3 ? 'var(--green-bg)' : 'var(--blue-bg)'}` : 'none',
            }} />
            <span style={{ fontSize: '.56rem', fontWeight: isCurrent ? 800 : 600, color: done ? 'var(--txt)' : 'var(--muted2)', marginTop: 6 }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export const runtime = 'edge'

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const result = await getPartnerWithDeals(supabase, user.id)
  if (!result) redirect('/login')
  const { partner, deals } = result
  const { f = 'active' } = await searchParams

  // 3タブ：進行中(受付+対応中) / 完了(成約+支払済) / 不成立(lost)。不成立は進行中から除外。
  const filtered = deals.filter(d => {
    if (f === 'done') return ['confirmed', 'paid'].includes(d.status)
    if (f === 'lost') return d.status === 'lost'
    return ['received', 'in_progress'].includes(d.status)  // active（既定）
  })

  // L2: 明細件数（"+N"用）。service role で安全に集計（best-effort・テーブル未作成なら空）。
  const itemCounts: Record<string, number> = {}
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('deal_items').select('deal_id').in('deal_id', filtered.map(d => d.id))
    for (const r of (data ?? []) as { deal_id: string }[]) itemCounts[r.deal_id] = (itemCounts[r.deal_id] ?? 0) + 1
  } catch { /* best-effort */ }

  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 className="ty-h2">案件</h2>
          <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{filtered.length}件</span>
        </div>
        {/* ②A 帰属の安心感：これは“あなたの紹介”であることを明示 */}
        <p style={{ fontSize: '.63rem', color: 'var(--muted2)', margin: '0 2px', lineHeight: 1.6 }}>あなたが紹介した案件の進捗です。各案件が今どの段階かを確認できます。</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4, margin: '0 20px 16px' }}>
        {[['active', '進行中'], ['done', '完了'], ['lost', '不成立']].map(([val, lbl]) => (
          <Link key={val} href={`/app/cases?f=${val}`} style={{
            flex: 1, textAlign: 'center', textDecoration: 'none',
            padding: '9px 2px', borderRadius: 8, fontSize: '.7rem', fontWeight: 700,
            color: f === val ? 'var(--txt)' : 'var(--muted2)',
            background: f === val ? '#fff' : 'transparent',
            boxShadow: f === val ? '0 2px 8px rgba(14,14,20,.08)' : 'none',
          }}>
            {lbl}
          </Link>
        ))}
      </div>

      {/* Deal list */}
      <div style={{ padding: '0 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 11, padding: '46px 26px' }}>
            <div style={{ width: 52, height: 52, borderRadius: 15, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.6">
                <path d="M4 6h16M4 12h16M4 18h10"/>
              </svg>
            </div>
            <b style={{ fontSize: '.84rem' }}>案件がありません</b>
            <p style={{ fontSize: '.71rem', lineHeight: 1.75, color: 'var(--muted2)' }}>
              「紹介する」ボタンから案件を登録しましょう。
            </p>
          </div>
        ) : (
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map(d => {
              const step = STATUS_STEP[d.status] ?? 0
              return (
                <Link
                  key={d.id}
                  href={`/app/cases/${d.id}`}
                  className="card-hover lift"
                  style={{
                    display: 'block', textDecoration: 'none', color: 'var(--txt)',
                    background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
                    padding: '14px 15px 13px', marginBottom: 10,
                  }}
                >
                  {/* Line 1 — ⑤サービスアバター + お客様名 + ⑥関わり方マーク (left), 報酬 (right, concise) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                      {d.services
                        ? <ServiceAvatar logoPath={d.services.logo_path} icon={d.services.icon} color={d.services.color} name={d.services.name} size={30} />
                        : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={30} />}
                      {/* お客様名：中字・縮小 */}
                      <b style={{ fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        {customerHonorific(d)}
                      </b>
                      {!d.services && (
                        <span style={{ flexShrink: 0, fontSize: '.52rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 20, padding: '1px 7px' }}>相談</span>
                      )}
                      {(itemCounts[d.id] ?? 0) > 1 && (
                        <span style={{ flexShrink: 0, fontSize: '.52rem', fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 20, padding: '1px 6px' }}>+{itemCounts[d.id] - 1}</span>
                      )}
                      <span style={{ flexShrink: 0 }}><ChannelMark channel={d.channel} /></span>
                    </div>
                    {d.status === 'lost' ? (
                      <span style={{ flexShrink: 0, fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 10px' }}>不成立</span>
                    ) : d.amount > 0 && (
                      /* 金額：副次情報として縮小＋軽色 */
                      <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.8rem', fontWeight: 700, color: d.status === 'paid' ? 'var(--green)' : 'var(--muted2)', letterSpacing: '-.012em' }}>
                        ¥{d.amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* 段階ステッパー（不成立は見送りメッセージ） */}
                  {d.status === 'lost' ? (
                    <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 10 }}>この案件は不成立（見送り）となりました。</p>
                  ) : (
                    <StatusStepper step={step} />
                  )}

                  {/* ②A 現在の段階（パートナー視点ラベル）＋紹介日／最終更新（read-only・金額なし） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 11, paddingTop: 10, borderTop: '1px solid #F4F4F7', fontSize: '.58rem', color: 'var(--muted2)' }}>
                    <span style={{ fontWeight: 800, color: (d.status as string) === 'lost' ? 'var(--muted2)' : d.status === 'confirmed' || d.status === 'paid' ? 'var(--green)' : 'var(--blue)' }}>現在：{PARTNER_STAGE[d.status] ?? d.status}</span>
                    <span style={{ color: 'var(--line)' }}>|</span>
                    <span>紹介 {fmtDate(d.created_at)}</span>
                    <span style={{ color: 'var(--line)' }}>|</span>
                    <span>最終更新 {fmtDate(d.updated_at)}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
      <div style={{ height: 20 }} />
    </div>
  )
}
