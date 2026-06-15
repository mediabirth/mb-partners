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

const TEST_SERVICE_NAMES = new Set(['テスト', 'APIテスト', 'テスト用', 'test', 'Test'])

export async function getServicesWithMenus(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('services')
    .select('*, service_menus(*)')
    .eq('active', true)
    .order('sort')
  return (data ?? []).filter(
    (s: { name: string }) => !TEST_SERVICE_NAMES.has(s.name)
  ) as ServiceWithMenus[]
}

// Admin version: returns all services (including inactive), menus sorted by sort
export async function getAdminServicesWithMenus(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('services')
    .select('*, service_menus(*)')
    .order('sort')
  if (!data) return []
  return data.map(svc => ({
    ...svc,
    service_menus: [...(svc.service_menus ?? [])].sort((a: MenuRow, b: MenuRow) => a.sort - b.sort),
  })) as ServiceWithMenus[]
}

export async function getAllDeals(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('deals')
    .select(`
      id, customer_name, channel, source, status, amount, base_amount,
      fixed_month, consent, meeting_at, created_at, updated_at,
      service_id, internal_memo, reward_snapshot,
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
    .select('id, code, status, tax_type, created_at, kyc_verified_at, profiles(name, email, color, avatar_url, role)')
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

// Optimized: partner + deals in a single PostgREST embedded select
export async function getPartnerWithDeals(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('partners')
    .select(`
      id, code, status, tax_type, bank,
      deals:deals!partner_id(
        id, customer_name, channel, source, status, amount,
        fixed_month, consent, meeting_at, created_at, updated_at, service_id,
        services(id, name, subtitle, icon, color)
      )
    `)
    .eq('profile_id', userId)
    .single()
  if (!data) return null
  const { deals: rawDeals, ...partnerFields } = data as any
  const deals = ([...(rawDeals ?? [])] as DealRow[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return { partner: partnerFields as PartnerRow, deals }
}

// Optimized: events by userId via double inner join (no need for partnerId → enables full parallelism)
export async function getRecentEventsByUserId(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('deal_events')
    .select('id, body, created_at, deal_id, deals!inner(partners!inner(profile_id))')
    .eq('visible_to_partner', true)
    .eq('deals.partners.profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(8)
  return (data ?? []).map(({ id, body, created_at, deal_id }: any) => ({ id, body, created_at, deal_id }))
}

// Optimized: events via inner join on partner_id (avoids needing dealIds first)
export async function getRecentEventsByPartnerId(supabase: SupabaseClient, partnerId: string) {
  const { data } = await supabase
    .from('deal_events')
    .select('id, body, created_at, deal_id, deals!inner(partner_id)')
    .eq('visible_to_partner', true)
    .eq('deals.partner_id', partnerId)
    .order('created_at', { ascending: false })
    .limit(8)
  return (data ?? []).map(({ id, body, created_at, deal_id }: any) => ({ id, body, created_at, deal_id }))
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ServiceRow = {
  id: string; name: string; subtitle: string | null; url: string | null
  description: string | null; who: string | null
  icon: string; color: string; rail: string | null; active: boolean; sort: number
  logo_path: string | null
  // ※サービス単位 coop_*/ft_* は廃止（協力は service_menus.coop_* に一本化）
  coverage_steps: { label: string; included: boolean }[] | null
}

export type MenuRow = {
  id: string; service_id: string; name: string
  ref_type: 'fixed' | 'rate'; ref_value: number
  ref_base: string | null
  ref_trigger: string | null; ref_months: number
  example_ref: string | null
  sort: number
  coverage_steps: { label: string; included: boolean }[] | null
  qualification: string | null
  // ⑧ per-menu engagement（紹介/協力は ref_enabled/coop_enabled で判定。category/ft_* は廃止）
  ref_enabled: boolean
  coop_enabled: boolean
  coop_type: 'fixed' | 'rate' | null
  coop_value: number | null
  coop_base: string | null
  coop_coverage: { label: string; included: boolean }[] | null
  coop_condition: string | null
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
  base_amount: number | null
  reward_snapshot: { ref_type?: string; ref_value?: number; ref_base?: string; [k: string]: unknown } | null
  services: { id: string; name: string; subtitle: string | null; icon: string; color: string } | null
  partners: { id: string; code: string; profiles: { name: string; color: string } | null } | null
}

export type PartnerRow = {
  id: string; code: string; status: string; tax_type: string
  created_at: string; kyc_verified_at: string | null
  bank: BankInfo | null
  profiles: { name: string; email: string; color: string; avatar_url: string | null; role?: string } | null
}

export type BankInfo = {
  bank_name: string
  branch_name: string
  account_type: string
  account_number: string
  account_holder: string
}
