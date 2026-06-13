import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import BankChangePanel from './BankChangePanel'

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) redirect('/console')

  const service = await createServiceRoleClient()

  // パートナー詳細取得
  const { data: partner } = await service
    .from('partners')
    .select('id, code, status, tax_type, kyc_verified_at, bank, created_at, profiles(name, email, color)')
    .eq('id', id)
    .single()

  if (!partner) notFound()

  // 案件件数
  const { count: dealCount } = await service
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', id)

  // 口座変更申請一覧（最新10件）
  const { data: bankRequests } = await service
    .from('bank_change_requests')
    .select('id, before_bank, new_bank, status, reject_reason, created_at, reviewed_at')
    .eq('partner_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const p = partner as typeof partner & {
    profiles: { name: string; email: string; color: string } | null
  }

  function statusLabel(s: string) {
    const m: Record<string, string> = { active: '稼働中', pending: '審査中', suspended: '停止' }
    return m[s] ?? s
  }
  function statusColor(s: string) {
    const m: Record<string, string> = { active: '#15917E', pending: '#D98914', suspended: '#C2479E' }
    return m[s] ?? 'var(--muted2)'
  }

  const pendingCount = (bankRequests ?? []).filter(r => r.status === 'pending').length

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile.name ?? '管理者'} profileColor={profile.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{
          background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--line)', padding: '13px 28px',
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <Link href="/console/partners" style={{ fontSize: '.72rem', color: 'var(--blue)', textDecoration: 'none' }}>
            ← パートナー一覧
          </Link>
          <span style={{ color: 'var(--line)' }}>/</span>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, margin: 0 }}>
            {p.profiles?.name ?? p.code}
          </h1>
          {pendingCount > 0 && (
            <span style={{ fontSize: '.6rem', fontWeight: 700, background: '#D98914', color: '#fff', borderRadius: 20, padding: '2px 8px' }}>
              申請 {pendingCount}件
            </span>
          )}
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 720 }}>
          {/* パートナー基本情報 */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: p.profiles?.color ?? '#B9BAC4',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.88rem', fontWeight: 700, flexShrink: 0,
              }}>
                {(p.profiles?.name ?? p.code)[0]}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontSize: '.95rem' }}>{p.profiles?.name ?? '—'}</b>
                  <span style={{ fontFamily: 'Inter', fontSize: '.62rem', color: 'var(--muted2)' }}>{p.code}</span>
                  <span style={{
                    fontSize: '.6rem', fontWeight: 700, padding: '2px 7px',
                    borderRadius: 20, background: '#F4F4F7', color: statusColor(p.status),
                  }}>
                    {statusLabel(p.status)}
                  </span>
                </div>
                <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>
                  {p.profiles?.email}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginBottom: 3 }}>累計案件</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'Inter' }}>{dealCount ?? 0}</div>
              </div>
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginBottom: 3 }}>税区分</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600 }}>
                  {p.tax_type === 'individual' ? '個人（源泉あり）' : '法人'}
                </div>
              </div>
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginBottom: 3 }}>KYC</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: p.kyc_verified_at ? '#15917E' : 'var(--muted2)' }}>
                  {p.kyc_verified_at ? '✓ 確認済' : '未確認'}
                </div>
              </div>
            </div>

            {/* 現在の口座情報 */}
            {p.bank && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 6 }}>登録済み振込口座</div>
                <div style={{ fontSize: '.75rem', lineHeight: 1.8 }}>
                  {(p.bank as { bank_name?: string }).bank_name}
                  {(p.bank as { branch_name?: string }).branch_name}
                  {(p.bank as { account_type?: string }).account_type}
                  {(p.bank as { account_number?: string }).account_number}
                  <span style={{ marginLeft: 8, fontWeight: 700 }}>
                    {(p.bank as { account_holder?: string }).account_holder}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 口座変更申請パネル */}
          <BankChangePanel requests={(bankRequests ?? []) as Parameters<typeof BankChangePanel>[0]['requests']} />
        </div>
      </div>
    </div>
  )
}
