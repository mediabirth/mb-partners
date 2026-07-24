import { cache } from 'react'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'

export type AppPersonaContext = {
  uid: string
  profile: { name: string | null; color: string | null; avatar_url: string | null } | null
  partner: {
    id: string
    code: string | null
    is_frontier: boolean | null
    supplier_rate_card: unknown
    company_name: string | null
    tax_type: string | null
  } | null
  brands: { id: string; name: string }[]
}

/**
 * /app の layout と home が共有する本人・ペルソナ解決。
 * profile/partner は同じ uid だけに依存するため並列、service は partner.id 確定後に取得する。
 * cache() により同一RSC要求内の layout/page で値と認証境界を変えずに重複読取を除く。
 */
export const getAppPersonaContext = cache(async (): Promise<AppPersonaContext | null> => {
  const uid = await getCachedUid()
  if (!uid) return null

  const supabase = await createClient()
  const [{ data: profile }, { data: partner }] = await Promise.all([
    supabase.from('profiles').select('name, color, avatar_url').eq('id', uid).single(),
    supabase.from('partners')
      .select('id, code, is_frontier, supplier_rate_card, company_name, tax_type')
      .eq('profile_id', uid)
      .maybeSingle(),
  ])

  let brands: { id: string; name: string }[] = []
  if (partner) {
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('services').select('id, name').eq('supplier_partner_id', partner.id)
    brands = (data ?? []) as { id: string; name: string }[]
  }

  return {
    uid,
    profile: profile as AppPersonaContext['profile'],
    partner: partner as AppPersonaContext['partner'],
    brands,
  }
})
