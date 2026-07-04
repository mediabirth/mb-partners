import { redirect } from 'next/navigation'
import { loadVendorBundle } from '@/lib/vendor-data'
import VendorMypageClient from './VendorMypageClient'

export const runtime = 'edge'

export default async function VendorMypage() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const d = b.delivery
  // ★表示名はベンダーアイデンティティ（delivery 名）を正とする＝partner 面の profiles.name を混ぜない
  //   （同一メール二重ロールでも vendor 面は vendor 名で一貫）。
  const vendorName = d.nickname || d.name
  return (
    <VendorMypageClient
      vendorName={vendorName}
      avatarUrl={b.profile.avatar_url ?? null}
      color={b.profile.color ?? 'var(--c-blue)'}
      displayCode={d.display_code ?? null}
      d={{
        nickname: d.nickname ?? null, name: d.name, contact_email: d.contact_email ?? null,
        phone: d.phone ?? null, address: d.address ?? null, tax_type: d.tax_type ?? null,
        bank_name: d.bank_name ?? null, bank_branch: d.bank_branch ?? null, bank_account: d.bank_account ?? null,
        bank_holder_kana: d.bank_holder_kana ?? null, invoice_number: d.invoice_number ?? null,
      }}
    />
  )
}
