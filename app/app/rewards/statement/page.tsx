import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId, getDealsForPartner } from '@/lib/supabase/queries'
import StatementClient from './StatementClient'

export default async function StatementPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const [partner, profileRes] = await Promise.all([
    getPartnerByUserId(supabase, user.id),
    supabase.from('profiles').select('name').eq('id', user.id).single(),
  ])
  if (!partner) redirect('/login')

  const deals = await getDealsForPartner(supabase, partner.id)

  // Build monthly + annual data
  const paidOrConfirmed = deals.filter(d => d.status === 'confirmed' || d.status === 'paid')

  const byMonth: Record<string, typeof deals> = {}
  for (const d of paidOrConfirmed) {
    const key = d.fixed_month?.substring(0, 7) ?? d.created_at.substring(0, 7)
    ;(byMonth[key] ??= []).push(d)
  }
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  const now = new Date()
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  function withholding(gross: number) {
    return partner!.tax_type === 'individual' ? Math.round(gross * 0.1021) : 0
  }

  const monthlyData = months.map(ym => {
    const mDeals = byMonth[ym]
    const gross = mDeals.reduce((s, d) => s + d.amount, 0)
    const wh = withholding(gross)
    const net = gross - wh
    const [y, m] = ym.split('-')
    const isPaid = mDeals.every(d => d.status === 'paid')
    return {
      ym, year: y, month: m,
      deals: mDeals.map(d => ({
        date: new Date(d.fixed_month ?? d.created_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' }),
        name: `${d.customer_name} / ${d.services?.name ?? ''}`,
        channel: d.channel === 'referral' ? '紹介' : '営業',
        amount: d.amount,
      })),
      gross, wh, net, isPaid,
    }
  })

  const annualGross = paidOrConfirmed.reduce((s, d) => s + d.amount, 0)
  const annualWh = withholding(annualGross)
  const annualNet = annualGross - annualWh

  const bank = partner.bank as { bank_name?: string; account_number?: string } | null
  const bankDisplay = bank ? `${bank.bank_name ?? ''} ****${bank.account_number?.slice(-4) ?? ''}` : ''
  const partnerName = profileRes.data?.name ?? ''
  const partnerCode = partner.code

  return (
    <StatementClient
      partnerName={partnerName}
      partnerCode={partnerCode}
      bankDisplay={bankDisplay}
      monthlyData={monthlyData}
      annualGross={annualGross}
      annualWh={annualWh}
      annualNet={annualNet}
      taxType={partner.tax_type ?? 'individual'}
    />
  )
}
