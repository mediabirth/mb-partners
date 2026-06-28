import { redirect } from 'next/navigation'
import Link from 'next/link'
import { loadVendorBundle } from '@/lib/vendor-data'
import ProfileHeader from '@/components/ui/ProfileHeader'
import AvatarEditor from '@/components/ui/AvatarEditor'

export const runtime = 'edge'

// 本人確認lock 行（KYCで確定する項目＝ベンダー側では編集不可表示）。
function LockRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 15px', borderBottom: last ? 'none' : '1px solid #F2F2F6', fontSize: '.77rem', gap: 10 }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" aria-label="本人確認"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
      </div>
      <b style={{ fontSize: '.74rem', textAlign: 'right' }}>{value}</b>
    </div>
  )
}
function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 15px', borderBottom: last ? 'none' : '1px solid #F2F2F6', fontSize: '.77rem', gap: 10 }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0 }}>{label}</div>
      <b style={{ fontSize: '.74rem', textAlign: 'right' }}>{value}</b>
    </div>
  )
}

export default async function VendorMypage() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const d = b.delivery
  const name = b.profile.name ?? d.name
  const color = b.profile.color ?? 'var(--c-blue)'
  const email = d.contact_email ?? '—'
  // ★職種(kind)は一切表示しない。本人確認lock = お名前/メール？いいえ、メールは表示。lock = お名前/税区分/振込先/インボイス。

  return (
    <div className="page-anim" style={{ paddingTop: 22 }}>
      <div style={{ padding: '0 24px 6px', fontSize: '1rem', fontWeight: 900, letterSpacing: '-.01em' }}>マイページ</div>
      {/* アバター(編集可)＋名前＋IDバッジ。職種バッジは撤去。 */}
      <ProfileHeader
        avatar={<AvatarEditor name={name} color={color} src={b.profile.avatar_url} size={56} endpoint="/api/vendor/avatar" />}
        name={name}
        badges={<>
          <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--c-blue)', background: 'var(--blue-bg)', borderRadius: 20, padding: '2px 10px' }}>MB Partners デリバリー</span>
          {d.display_code && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 10px', fontFamily: 'Inter' }}>{d.display_code}</span>}
        </>}
      />

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>プロフィール</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <Row label="ニックネーム（表示名）" value={d.nickname ?? name} />
        <LockRow label="お名前" value={d.name} />
        <Row label="メールアドレス" value={email} />
        <Row label="電話番号" value={d.phone ?? '—'} />
        <Row label="住所" value={d.address ?? '—'} />
        <LockRow label="税区分" value={d.tax_type ?? '—'} last />
      </div>

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>振込先口座</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <LockRow label="銀行・支店" value={d.bank_name ? `${d.bank_name} ${d.bank_branch ?? ''}`.trim() : '—'} />
        <LockRow label="口座" value={d.bank_account ?? '—'} />
        <LockRow label="名義（カナ）" value={d.bank_holder_kana ?? '—'} />
        <LockRow label="インボイス登録番号" value={d.invoice_number ?? '—'} last />
      </div>

      <div style={{ margin: '0 20px 30px' }}>
        <Link href="/vendor/settings" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>編集する</Link>
      </div>
    </div>
  )
}
