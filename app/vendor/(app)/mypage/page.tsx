import { redirect } from 'next/navigation'
import Link from 'next/link'
import { loadVendorBundle } from '@/lib/vendor-data'
import ProfileHeader from '@/components/ui/ProfileHeader'
import AvatarEditor from '@/components/ui/AvatarEditor'

export const runtime = 'edge'

function KV({ label, value, last }: { label: string; value: string; last?: boolean }) {
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
  const name = b.profile.name ?? b.delivery.name
  const color = b.profile.color ?? 'var(--blue)'
  const totalFee = b.assignments.reduce((s, a) => s + a.base_fee, 0)

  return (
    <div className="page-anim" style={{ paddingTop: 22 }}>
      {/* F-4：プロフィールヘッダー（3サーフェス共通）＋本人アバター編集（アップロード/イニシャル）。 */}
      <ProfileHeader
        avatar={<AvatarEditor name={name} color={color} src={b.profile.avatar_url} size={56} endpoint="/api/vendor/avatar" />}
        name={name}
        badges={<>
          <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 20, padding: '2px 10px' }}>MB Partners デリバリー</span>
          {b.delivery.kind && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 10px' }}>{b.delivery.kind}</span>}
        </>}
      />

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>プロフィール</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <KV label="お名前 / 屋号" value={name} />
        <KV label="役割" value="MB Partners デリバリー（業務委託先）" />
        <KV label="種別" value={b.delivery.kind ?? '—'} />
        <KV label="担当案件" value={`${b.assignments.length} 件`} />
        <KV label="委託費 合計" value={`¥${totalFee.toLocaleString()}`} last />
      </div>

      <div style={{ margin: '0 20px 30px' }}>
        <Link href="/vendor/settings" className="btn btn-g" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>設定</Link>
      </div>
    </div>
  )
}
