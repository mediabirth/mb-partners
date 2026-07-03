import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import ServiceAvatar from '@/components/ServiceAvatar'
import CountUp from '@/components/CountUp'
import RewardHero from '@/components/ui/RewardHero'
import { withholdingTax } from '@/lib/payout'
import { customerHonorific } from '@/lib/customer'

export const runtime = 'edge'

export default async function RewardsPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const result = await getPartnerWithDeals(supabase, user.id)
  if (!result) redirect('/login')
  const { partner, deals } = result

  // Group by month
  const byMonth: Record<string, typeof deals> = {}
  for (const d of deals) {
    if (d.status === 'confirmed' || d.status === 'paid') {
      const key = d.fixed_month?.substring(0, 7) ?? d.created_at.substring(0, 7)
      ;(byMonth[key] ??= []).push(d)
    }
  }
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  const totalGross = Object.values(byMonth).flat().reduce((s, d) => s + d.amount, 0)
  const paidGross  = deals.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0)
  const confirmedGross = deals.filter(d => d.status === 'confirmed').reduce((s, d) => s + d.amount, 0)
  const totalDeals = Object.values(byMonth).flat().length

  // 源泉計算は lib/payout の単一ソースを使用（コンソール close_month_batch と完全一致）
  function withholding(gross: number) {
    return withholdingTax(gross, partner?.tax_type)
  }

  return (
    <div>
      {/* F-4：報酬ヒーロー（vendor と同一の見え方）。計算は紹介報酬のまま・表示のみ統一。
          v3.1：APP側のみ .rh-q ラッパで太字を500へ静音化（.app-quiet 配下・共有RewardHero本体は非改変＝vendor不変）。 */}
      <div className="rh-q">
      <RewardHero
        label={`報酬（税抜） ${new Date().getFullYear()} 合計`}
        amount={totalGross}
        items={[
          { key: 'paid', label: '支払済', value: paidGross, format: 'yen' },
          { key: 'confirmed', label: '未払(確定)', value: confirmedGross, format: 'yen' },
          { key: 'count', label: '成約数', value: totalDeals, suffix: '件' },
        ]}
      />
      </div>

      {/* Statement buttons */}
      <div style={{ display: 'flex', gap: 8, margin: '14px 20px 0' }}>
        <Link href="/app/rewards/statement" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ flex: 1, padding: 11, marginTop: 0, textDecoration: 'none', textAlign: 'center', fontSize: '.7rem' }}>
          支払明細
        </Link>
        <Link href="/app/rewards/statement" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ flex: 1, padding: 11, marginTop: 0, textDecoration: 'none', textAlign: 'center', fontSize: '.7rem' }}>
          年間集計
        </Link>
      </div>

      {/* Monthly accordion */}
      <div style={{ padding: '22px 20px 6px' }}>
        <h2 style={{ fontSize: '.98rem', fontWeight: 500, marginBottom: 14 }}>月次明細</h2>
      </div>

      {months.length === 0 ? (
        <p style={{ padding: '0 20px', fontSize: '.7rem', color: 'var(--muted2)' }}>
          まだ確定・支払済みの報酬がありません。
        </p>
      ) : months.map(ym => {
        const monthDeals = byMonth[ym]
        const gross = monthDeals.reduce((s, d) => s + d.amount, 0)
        const wh    = withholding(gross)
        const net   = gross - wh
        const [y, m] = ym.split('-')
        const paid  = monthDeals.every(d => d.status === 'paid')

        return (
          <MonthAccordion
            key={ym}
            title={`${y}年${m}月`}
            subtitle={paid ? `支払済 · ${monthDeals.length}件` : `振込予定 · ${monthDeals.length}件`}
            net={net}
          >
            {monthDeals.map(d => (
              <div key={d.id} className="lift" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 6px', borderBottom: '1px solid var(--line)', fontSize: '.73rem', gap: 10, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {d.services && <ServiceAvatar logoPath={d.services.logo_path} icon={d.services.icon} color={d.services.color} name={d.services.name} size={26} />}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 500 }}>{customerHonorific(d)}</span>
                    </div>
                    <div style={{ fontSize: '.59rem', color: 'var(--muted)', marginTop: 1 }}>
                      {d.services?.name} · {d.status === 'paid' ? '支払済' : d.status === 'confirmed' ? '成約' : d.status === 'lost' ? '不成立' : d.status === 'in_progress' ? '対応中' : '受付'}
                    </div>
                  </div>
                </div>
                <span style={{ fontFamily: 'Inter', fontFeatureSettings: '"tnum"', fontWeight: 500, letterSpacing: '-.01em' }}>
                  ¥{d.amount.toLocaleString()}
                </span>
              </div>
            ))}
            {wh > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 6px', fontSize: '.73rem' }}>
                <span style={{ color: 'var(--muted2)' }}>源泉所得税(10.21%)</span>
                <span style={{ fontFamily: 'Inter', fontWeight: 500, color: 'var(--red)' }}>−¥{wh.toLocaleString()}</span>
              </div>
            )}
          </MonthAccordion>
        )
      })}

      {/* B: 「変更を申請」制度は廃止。振込口座はマイページから直接変更（変更時は登録メールへ通知＋履歴記録）。 */}
      <a href="/app/mypage" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '18px 0 0', padding: '13px 15px', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, textDecoration: 'none', color: 'var(--txt)' }}>
        <span style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>振込先口座の確認・変更はマイページから</span>
        <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>›</span>
      </a>

      <div style={{ height: 32 }} />
    </div>
  )
}

function MonthAccordion({ title, subtitle, net, children }: {
  title: string; subtitle: string; net: number; children: React.ReactNode
}) {
  // ⑧ 既定で折りたたみ（open なし）。行タップで内訳を展開（native details/summary, JS不要）。
  // chevron は details[open] で回転（globals に依存せず scoped style）。
  return (
    <details className="acc" style={{ margin: '0 20px 10px', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <style>{`.acc > summary::-webkit-details-marker{display:none} .acc[open] .acc-chev{transform:rotate(90deg)}`}</style>
      <summary className="card-hover ui-card" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '15px 14px', cursor: 'pointer', listStyle: 'none',
      }}>
        <div>
          <b style={{ fontSize: '.8rem', display: 'block' }}>{title}</b>
          <small style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{subtitle}・タップで内訳</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '1rem', fontFeatureSettings: '"tnum"', letterSpacing: '-.016em' }}>
            ¥{net.toLocaleString()}
          </span>
          <span className="acc-chev" style={{ color: 'var(--muted)', fontSize: '.85rem', transition: 'transform .2s ease', display: 'inline-block' }}>›</span>
        </div>
      </summary>
      <div style={{ borderTop: '1px solid var(--line)', padding: '0 8px 6px' }}>
        {children}
      </div>
    </details>
  )
}
