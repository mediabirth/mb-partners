import { redirect } from 'next/navigation'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId } from '@/lib/supabase/queries'
import MypageClient from './MypageClient'

export const runtime = 'edge'

export default async function MypagePage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const [partnerData, profileRes] = await Promise.all([
    getPartnerByUserId(supabase, user.id),
    supabase.from('profiles').select('name, email, color, avatar_url').eq('id', user.id).single(),
  ])
  if (!partnerData) redirect('/login')

  const profile = profileRes.data
  const bank = partnerData.bank as {
    bank_name?: string; branch_name?: string
    account_type?: string; account_number?: string; account_holder?: string
  } | null
  const p = partnerData as { phone?: string | null; address?: string | null; invoice_number?: string | null; is_frontier?: boolean; supplier_rate_card?: string | null }

  return (
    <MypageClient
      name={profile?.name ?? ''}
      email={profile?.email ?? user.email ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
      avatarColor={profile?.color ?? '#4733E6'}
      partnerCode={partnerData.code}
      taxType={partnerData.tax_type ?? 'individual'}
      bank={bank}
      phone={p.phone ?? null}
      address={p.address ?? null}
      invoiceNumber={p.invoice_number ?? null}
      isFrontier={p.is_frontier ?? false}
      isSupplier={!!p.supplier_rate_card}
    />
  )
}
