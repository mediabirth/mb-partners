import { redirect } from 'next/navigation'
import { loadVendorBundle } from '@/lib/vendor-data'
import VendorMypageClient from './VendorMypageClient'

export const runtime = 'edge'

export default async function VendorMypage() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const d = b.delivery
  // 表示名は受託者アイデンティティ（お名前/屋号＝delivery.name）を正とする＝partner 面の profiles.name を混ぜない。
  const name = d.name || d.nickname || '—'
  return (
    <VendorMypageClient
      name={name}
      email={d.contact_email ?? '—'}
      avatarUrl={b.profile.avatar_url ?? null}
      avatarColor={b.profile.color ?? 'var(--c-blue)'}
      displayCode={d.display_code ?? null}
      taxType={d.tax_type ?? null}
      phone={d.phone ?? null}
      address={d.address ?? null}
      invoiceNumber={d.invoice_number ?? null}
      bankName={d.bank_name ?? null}
      bankBranch={d.bank_branch ?? null}
      bankAccount={d.bank_account ?? null}
      bankHolderKana={d.bank_holder_kana ?? null}
    />
  )
}
