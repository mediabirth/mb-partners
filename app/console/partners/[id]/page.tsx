import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import BankChangePanel from './BankChangePanel'
import StatusControl from './StatusControl'
import FrontierControls from '@/components/FrontierControls'
import CountUp from '@/components/CountUp'
import { customerHonorific } from '@/lib/customer'

export const runtime = 'edge'

function statusLabel(s: string) {
  const m: Record<string, string> = { active: '稼働中', pending: '審査中', suspended: '停止' }
  return m[s] ?? s
}
function statusColor(s: string) {
  const m: Record<string, string> = { active: 'var(--green)', pending: 'var(--amber)', suspended: 'var(--red)' }
  return m[s] ?? 'var(--muted2)'
}
function statusBg(s: string) {
  const m: Record<string, string> = { active: 'var(--green-bg)', pending: 'var(--amber-bg)', suspended: 'var(--red-bg)' }
  return m[s] ?? 'var(--bg2)'
}
function dealStatusLabel(s: string) {
  const m: Record<string, string> = { received: '受付', in_progress: '対応中', confirmed: '成約', paid: '支払済' }
  return m[s] ?? s
}
function dealStatusColor(s: string) {
  const m: Record<string, string> = { received: 'var(--amber)', in_progress: 'var(--c-blue)', confirmed: 'var(--green)', paid: 'var(--green)' }
  return m[s] ?? 'var(--muted2)'
}
function dealStatusBg(s: string) {
  const m: Record<string, string> = { received: 'var(--amber-bg)', in_progress: 'var(--blue-bg)', confirmed: 'var(--green-bg)', paid: 'var(--green-bg)' }
  return m[s] ?? 'var(--bg2)'
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const service = await createServiceRoleClient()

  // Round 1: auth check + partner info + bank requests
  const [profileForCheck, partnerRes, bankRequestsRes] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', user.id).single(),
    service.from('partners')
      .select('id, code, status, tax_type, kyc_verified_at, bank, profile_id, created_at, is_frontier, frontier_id, frontier_linked_at, profiles(name, email, color)')
      .eq('id', id)
      .single(),
    service.from('bank_change_requests')
      .select('id, before_bank, new_bank, status, reject_reason, created_at, reviewed_at')
      .eq('partner_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (!profileForCheck.data || !['owner', 'manager'].includes(profileForCheck.data.role)) redirect('/console')

  const partner = partnerRes.data
  if (!partner) notFound()

  const bankRequests = bankRequestsRes.data ?? []

  // R2-B: フロンティア候補（is_frontier=true のパートナー）
  const { data: frontiersRaw } = await service
    .from('partners')
    .select('id, code, profiles(name)')
    .eq('is_frontier', true)
  const frontiers = (frontiersRaw ?? []).map((f: any) => ({ id: f.id, code: f.code, name: f.profiles?.name ?? f.code }))

  // Round 2: deals + payouts + inquiries (keyed by partner id)
  const [dealsRes, payoutsRes, inquiryCountRes] = await Promise.all([
    service.from('deals')
      .select('id, customer_name, customer_type, company_name, contact_name, status, amount, created_at, channel, services(name)')
      .eq('partner_id', id)
      .order('created_at', { ascending: false }),
    service.from('payout_items')
      .select('id, gross, withholding, net, payout_batches(month, status)')
      .eq('partner_id', id)
      .order('created_at', { ascending: false })
      .limit(24),
    service.from('inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', id),
  ])

  const deals        = (dealsRes.data ?? []) as any[]
  const payouts      = (payoutsRes.data ?? []) as any[]
  const inquiryCount = inquiryCountRes.count ?? 0

  const p = partner as typeof partner & {
    profiles: { name: string; email: string; color: string } | null
    profile_id: string
  }

  // KPI
  const now = new Date()
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const cumulativeReward = deals
    .filter((d: any) => ['paid', 'confirmed'].includes(d.status))
    .reduce((s: number, d: any) => s + (d.amount || 0), 0)
  const totalDeals     = deals.length
  const activeDeals    = deals.filter((d: any) => ['received', 'in_progress'].includes(d.status)).length
  const monthConfirmed = deals.filter((d: any) => d.status === 'confirmed' && d.fixed_month?.startsWith(ym)).length

  // Channel breakdown: referral (紹介) vs cooperation (協力) — channel ベース（service_menus.category は廃止）
  const referralDeals = deals.filter((d: any) => d.channel === 'referral').length
  const coopDeals = deals.filter((d: any) =>
    d.channel === 'cooperation' || d.channel === 'frontier'
  ).length
  const directDeals = totalDeals - referralDeals - coopDeals

  const pendingBankCount = bankRequests.filter(r => r.status === 'pending').length

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profileForCheck.data?.name ?? '管理者'} profileColor={profileForCheck.data?.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{
          background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--line)', padding: '13px 28px',
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <Link href="/console/partners" style={{ fontSize: '.72rem', color: 'var(--c-blue)', textDecoration: 'none' }}>
            ← パートナー一覧
          </Link>
          <span style={{ color: 'var(--line)' }}>/</span>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, margin: 0 }}>{p.profiles?.name ?? p.code}</h1>
          {pendingBankCount > 0 && (
            <span style={{ fontSize: '.6rem', fontWeight: 700, background: 'var(--amber)', color: '#fff', borderRadius: 20, padding: '2px 8px' }}>
              口座申請 {pendingBankCount}件
            </span>
          )}
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 900 }}>

          {/* Header card */}
          <div className="card-hover ui-card" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '22px 24px', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: p.profiles?.color ?? '#B9BAC4',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', fontWeight: 700,
              }}>
                {(p.profiles?.name ?? p.code)[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: '1rem' }}>{p.profiles?.name ?? '—'}</b>
                  <span style={{ fontFamily: 'Inter', fontSize: '.62rem', color: 'var(--muted2)' }}>{p.code}</span>
                  <span style={{
                    fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: statusBg(p.status), color: statusColor(p.status),
                  }}>
                    {statusLabel(p.status)}
                  </span>
                  {p.kyc_verified_at && (
                    <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--green)' }}>✓ KYC確認済</span>
                  )}
                  <span className="chip chip-direct">{p.tax_type === 'individual' ? '個人' : '法人'}</span>
                </div>
                <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>
                  {p.profiles?.email}
                  <span style={{ margin: '0 6px', color: 'var(--line)' }}>·</span>
                  登録 {new Date(p.created_at).toLocaleDateString('ja', { year: 'numeric', month: 'short', day: 'numeric' })}
                  <span style={{ margin: '0 6px', color: 'var(--line)' }}>·</span>
                  {p.tax_type === 'individual' ? '個人（源泉10.21%）' : '法人'}
                </div>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
            {[
              { label: '累計報酬(税込)', value: cumulativeReward, unit: '',   yen: true,  color: 'var(--c-blue)' },
              { label: '累計案件',       value: totalDeals,       unit: '件', yen: false, color: undefined },
              { label: '進行中',         value: activeDeals,      unit: '件', yen: false, color: activeDeals > 0 ? 'var(--amber)' : undefined },
              { label: '今月成約',       value: monthConfirmed,   unit: '件', yen: false, color: monthConfirmed > 0 ? 'var(--green)' : undefined },
            ].map(kpi => (
              <div key={kpi.label} className="card-hover ui-card" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {kpi.label}
                </div>
                <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.05rem', color: kpi.color ?? 'var(--txt)' }}>
                  <CountUp value={kpi.value} format={kpi.yen ? 'yen' : 'number'} />{kpi.unit}
                </div>
              </div>
            ))}
          </div>

          {/* 是正2：チャネル区分(関わり方の区分)内訳は廃止（区分語を出さない）。 */}

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

            {/* Left: deals + payouts */}
            <div>
              {/* Deals */}
              <div className="card-hover ui-card" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 style={{ fontSize: '.82rem', fontWeight: 700, margin: 0 }}>案件一覧</h2>
                  <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{totalDeals}件</span>
                </div>
                {deals.length === 0 ? (
                  <p style={{ padding: '16px 18px', fontSize: '.72rem', color: 'var(--muted2)', margin: 0 }}>案件なし</p>
                ) : deals.slice(0, 30).map((d: any, i: number) => (
                  <div key={d.id} className="lift" style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
                    borderTop: i > 0 ? '1px solid #F2F2F6' : undefined,
                  }}>
                    <span style={{
                      fontSize: '.56rem', fontWeight: 700, padding: '2px 6px', borderRadius: 10, flexShrink: 0,
                      background: dealStatusBg(d.status), color: dealStatusColor(d.status),
                    }}>
                      {dealStatusLabel(d.status)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {customerHonorific(d)}
                      </div>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>
                        {d.services?.name ?? '相談（サービス未定）'}
                        <span style={{ margin: '0 5px' }}>·</span>
                        {new Date(d.created_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.8rem', fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                      ¥{(d.amount || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {/* Payout history */}
              {payouts.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
                    <h2 style={{ fontSize: '.82rem', fontWeight: 700, margin: 0 }}>振込履歴</h2>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '.9fr .7fr .7fr .7fr .7fr', padding: '7px 18px', background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
                    {['月', 'ステータス', '総額', '源泉', '振込額'].map(h => (
                      <span key={h} style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</span>
                    ))}
                  </div>
                  {payouts.map((item: any, i: number) => (
                    <div key={item.id} style={{
                      display: 'grid', gridTemplateColumns: '.9fr .7fr .7fr .7fr .7fr',
                      padding: '10px 18px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined,
                      alignItems: 'center',
                    }}>
                      <span style={{ fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 600 }}>
                        {item.payout_batches?.month ?? '—'}
                      </span>
                      <span style={{
                        fontSize: '.58rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8, display: 'inline-block',
                        background: item.payout_batches?.status === 'paid' ? 'var(--green-bg)' : 'var(--bg2)',
                        color: item.payout_batches?.status === 'paid' ? 'var(--green)' : 'var(--muted2)',
                      }}>
                        {item.payout_batches?.status === 'paid' ? '振込済' : '処理中'}
                      </span>
                      <span style={{ fontFamily: 'Inter', fontSize: '.72rem', fontFeatureSettings: '"tnum"' }}>
                        ¥{(item.gross || 0).toLocaleString()}
                      </span>
                      <span style={{ fontFamily: 'Inter', fontSize: '.72rem', color: 'var(--muted2)', fontFeatureSettings: '"tnum"' }}>
                        -{(item.withholding || 0).toLocaleString()}
                      </span>
                      <span style={{ fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                        ¥{(item.net || 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: info + status control + bank + inquiries */}
            <div>
              {/* Basic info */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                <h2 style={{ fontSize: '.78rem', fontWeight: 700, margin: '0 0 12px' }}>基本情報</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.7rem' }}>
                  <tbody>
                    {[
                      { label: '税区分', value: p.tax_type === 'individual' ? '個人（源泉10.21%控除）' : '法人' },
                      { label: 'KYC',    value: p.kyc_verified_at ? `✓ 確認済 (${new Date(p.kyc_verified_at).toLocaleDateString('ja')})` : '未確認' },
                      { label: 'コード', value: p.code },
                    ].map(row => (
                      <tr key={row.label}>
                        <td style={{ padding: '5px 0', color: 'var(--muted2)', whiteSpace: 'nowrap', paddingRight: 12 }}>{row.label}</td>
                        <td style={{ padding: '5px 0', fontWeight: 500, color: row.label === 'KYC' && p.kyc_verified_at ? 'var(--green)' : 'var(--txt)' }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Inquiries */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
                <Link
                  href={`/console/inquiries?partner_id=${id}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ fontSize: '.78rem', fontWeight: 700 }}>問い合わせ</span>
                  <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.82rem', color: inquiryCount > 0 ? 'var(--c-blue)' : 'var(--muted2)' }}>
                    {inquiryCount}件 →
                  </span>
                </Link>
              </div>

              {/* Bank */}
              {p.bank && (
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                  <h2 style={{ fontSize: '.78rem', fontWeight: 700, margin: '0 0 10px' }}>振込口座</h2>
                  <div style={{ fontSize: '.72rem', lineHeight: 2, color: 'var(--txt)' }}>
                    <div>{(p.bank as any).bank_name} {(p.bank as any).branch_name}</div>
                    <div>{(p.bank as any).account_type} {(p.bank as any).account_number}</div>
                    <div style={{ fontWeight: 700 }}>{(p.bank as any).account_holder}</div>
                  </div>
                </div>
              )}

              {/* Status control (suspend / reactivate) */}
              <StatusControl partnerId={id} currentStatus={p.status as 'active' | 'pending' | 'suspended'} />

              {/* R2-B: 役割 / フロンティア */}
              <FrontierControls
                partnerId={id}
                initialIsFrontier={!!(partner as any).is_frontier}
                initialFrontierId={(partner as any).frontier_id ?? null}
                frontiers={frontiers}
              />

              {/* Bank change requests */}
              <BankChangePanel requests={bankRequests as Parameters<typeof BankChangePanel>[0]['requests']} />
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
