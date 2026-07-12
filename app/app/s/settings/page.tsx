import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
async function requireSupplierId(): Promise<string> {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, supplier_rate_card').eq('profile_id', user!.id).maybeSingle()
  if (!me) redirect('/app')
  if (!me!.supplier_rate_card) {
    const admin = await createServiceRoleClient()
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', me!.id).limit(1)
    if (!sv?.length) redirect('/app')
  }
  return me!.id
}

import PageGuide from '@/components/PageGuide'
import { SG_SETTINGS } from '@/lib/supplier-guides'
import BankCard from './BankCard'
// 設定: 会社情報・変更申請履歴・通知先
const KIND_JP: Record<string, string> = { public_description: '顧客向け説明', image: 'イメージ画像', menu_name: 'メニュー名', visibility: '公開/非公開' }
export default async function SupplierSettingsPage() {
  const supplierId = await requireSupplierId()
  const admin = await createServiceRoleClient()
  const { data: p } = await admin.from('partners').select('code, tax_type, phone, bank, profiles(name, email)').eq('id', supplierId).maybeSingle()
  const prof = (p?.profiles ?? null) as { name?: string | null; email?: string | null } | null
  const { data: reqs } = await admin.from('supplier_change_requests').select('id, kind, payload, status, reason, created_at').eq('supplier_partner_id', supplierId).order('created_at', { ascending: false }).limit(30)
  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13 }
  const ROW: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.74rem' }
  return (
    <div className="page-anim" style={{ padding: '18px 18px 40px', maxWidth: 720, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>設定</h1>
        <PageGuide data={SG_SETTINGS} />
      </div>
      <h2 style={{ fontSize: '.78rem', fontWeight: 700, margin: '0 0 8px' }}>会社情報</h2>
      <div style={{ ...CARD, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ ...ROW, borderTop: 'none' }}><span style={{ color: 'var(--muted2)' }}>会社名</span><b>{prof?.name ?? '—'}</b></div>
        <div style={ROW}><span style={{ color: 'var(--muted2)' }}>ID</span><span className="tnum" style={{ fontFamily: 'Inter' }}>{p?.code ?? '—'}</span></div>
        <div style={ROW}><span style={{ color: 'var(--muted2)' }}>税区分</span><span>{p?.tax_type === 'corporate' ? '法人' : '個人'}</span></div>
        <div style={ROW}><span style={{ color: 'var(--muted2)' }}>通知先メール</span><span>{prof?.email ?? '—'}</span></div>
        <div style={ROW}><span style={{ color: 'var(--muted2)' }}>電話番号</span><span>{p?.phone ?? '—'}</span></div>
      </div>

      <h2 style={{ fontSize: '.78rem', fontWeight: 700, margin: '0 0 8px' }}>振込先口座</h2>
      <BankCard bank={(p as { bank?: Record<string, string> | null })?.bank ?? null} />

      <div style={{ ...CARD, padding: '11px 15px', marginTop: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, fontSize: '.72rem' }}>あなた自身のこと（プロフィール・連絡先・パスワード）</span>
        <a href="/app/mypage" style={{ flexShrink: 0, fontSize: '.68rem', color: 'var(--c-blue)', textDecoration: 'none' }}>マイページ →</a>
      </div>

      <h2 style={{ fontSize: '.78rem', fontWeight: 700, margin: '0 0 8px' }}>変更申請の履歴</h2>
      <div style={{ ...CARD, overflow: 'hidden' }}>
        {(reqs ?? []).length === 0 ? (
          <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 15px', margin: 0 }}>申請はまだありません（商品ページから申請できます）。</p>
        ) : (reqs ?? []).map((r, i) => (
          <div key={r.id} style={{ ...ROW, borderTop: i === 0 ? 'none' : ROW.borderTop as string, alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{KIND_JP[r.kind] ?? r.kind}{typeof (r.payload as { value?: unknown })?.value === 'string' ? ` ・ ${String((r.payload as { value?: unknown }).value).slice(0, 40)}` : ''}</span>
            <span style={{ flexShrink: 0, fontWeight: 500, color: r.status === 'pending' ? 'var(--c-blue)' : r.status === 'approved' ? 'var(--green)' : 'var(--muted2)' }}>
              {r.status === 'pending' ? '確認待ち' : r.status === 'approved' ? '反映済み' : `見送り${r.reason ? `（${r.reason}）` : ''}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
