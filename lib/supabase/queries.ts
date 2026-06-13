import type { SupabaseClient } from '@supabase/supabase-js'

export async function getPartnerByUserId(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('partners')
    .select('id, code, status, tax_type, bank')
    .eq('profile_id', userId)
    .single()
  return data
}

export async function getDealsForPartner(supabase: SupabaseClient, partnerId: string) {
  const { data } = await supabase
    .from('deals')
    .select('id, customer_name, channel, source, status, amount, fixed_month, consent, meeting_at, created_at, updated_at, service_id, services(id, name, subtitle, icon, color)')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as DealRow[]
}

export async function getDealWithEvents(supabase: SupabaseClient, dealId: string, partnerId: string) {
  const [dealRes, eventsRes] = await Promise.all([
    supabase
      .from('deals')
      .select('id, customer_name, channel, source, status, amount, fixed_month, consent, meeting_at, created_at, internal_memo, service_id, menu_id, reward_snapshot, services(id, name, subtitle, icon, color), service_menus(id, name, ref_type, ref_value, ref_trigger, ref_months)')
      .eq('id', dealId)
      .eq('partner_id', partnerId)
      .single(),
    supabase
      .from('deal_events')
      .select('id, body, created_at, visible_to_partner')
      .eq('deal_id', dealId)
      .eq('visible_to_partner', true)
      .order('created_at', { ascending: false }),
  ])
  return { deal: dealRes.data, events: eventsRes.data ?? [] }
}

export async function getServicesWithMenus(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('services')
    .select('*, service_menus(*)')
    .eq('active', true)
    .order('sort')
  return (data ?? []) as ServiceWithMenus[]
}

export async function getAllDeals(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('deals')
    .select(`
      id, customer_name, channel, source, status, amount,
      fixed_month, consent, meeting_at, created_at, updated_at,
      service_id, internal_memo,
      services(id, name, subtitle, icon, color),
      partners(id, code, profiles(name, color))
    `)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as AdminDealRow[]
}

export async function getAllDealsWithEvents(supabase: SupabaseClient, dealId: string) {
  const [dealRes, eventsRes] = await Promise.all([
    supabase
      .from('deals')
      .select('*, services(id, name, subtitle, icon, color), service_menus(*), partners(id, code, profiles(name, color, email))')
      .eq('id', dealId)
      .single(),
    supabase
      .from('deal_events')
      .select('id, body, created_at, visible_to_partner, profiles(name)')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false }),
  ])
  return { deal: dealRes.data, events: eventsRes.data ?? [] }
}

export async function getPartnersWithProfiles(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('partners')
    .select('id, code, status, tax_type, created_at, kyc_verified_at, profiles(name, email, color, avatar_url)')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as PartnerRow[]
}

export async function getReferralLinksForPartner(supabase: SupabaseClient, partnerId: string) {
  const { data } = await supabase
    .from('referral_links')
    .select('id, service_id, token, created_at, services(name)')
    .eq('partner_id', partnerId)
  return data ?? []
}

export async function getRecentDealEvents(supabase: SupabaseClient, partnerDealIds: string[]) {
  if (partnerDealIds.length === 0) return []
  const { data } = await supabase
    .from('deal_events')
    .select('id, body, created_at, deal_id')
    .in('deal_id', partnerDealIds)
    .eq('visible_to_partner', true)
    .order('created_at', { ascending: false })
    .limit(8)
  return data ?? []
}

export async function getPayoutItemsForPartner(supabase: SupabaseClient, partnerId: string) {
  const { data } = await supabase
    .from('payout_items')
    .select('id, gross, withholding, net, batch_id, payout_batches(month, status)')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
  return data ?? []
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ServiceRow = {
  id: string; name: string; subtitle: string | null; url: string | null
  description: string | null; who: string | null
  icon: string; color: string; rail: string; active: boolean; sort: number
  logo_path: string | null
}

export type MenuRow = {
  id: string; service_id: string; name: string
  ref_type: 'fixed' | 'rate'; ref_value: number
  ref_trigger: string | null; ref_months: number
  ft_enabled: boolean; ft_rate: number | null; ft_basis: string | null
  ft_trigger: string | null; ft_condition: string | null
  example_ref: string | null; example_ft: string | null; sort: number
}

export type ServiceWithMenus = ServiceRow & { service_menus: MenuRow[] }

export type DealRow = {
  id: string; customer_name: string; channel: string; source: string
  status: 'received' | 'in_progress' | 'confirmed' | 'paid'
  amount: number; fixed_month: string | null
  consent: boolean; meeting_at: string | null
  created_at: string; updated_at: string; service_id: string
  services: { id: string; name: string; subtitle: string | null; icon: string; color: string } | null
}

export type AdminDealRow = DealRow & {
  internal_memo: string | null
  partners: { id: string; code: string; profiles: { name: string; color: string } | null } | null
}

export type PartnerRow = {
  id: string; code: string; status: string; tax_type: string
  created_at: string; kyc_verified_at: string | null
  bank: BankInfo | null
  profiles: { name: string; email: string; color: string; avatar_url: string | null } | null
}

export type BankInfo = {
  bank_name: string
  branch_name: string
  account_type: string
  account_number: string
  account_holder: string
}
