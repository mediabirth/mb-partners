import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
export { safePublicDescription, SHARE_CARD_APEX } from '@/lib/share-card-public'
import { validUuid } from '@/lib/share-card-public'

export type ShareCardService = {
  id: string
  name: string
  color: string | null
  image_url: string | null
}

export type ShareCardMenu = {
  id: string
  name: string
  public_description: string | null
}

export type ShareCardData = {
  service: ShareCardService
  menu: ShareCardMenu | null
}

function oneRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

async function readShareCard(token: string, menuId: string): Promise<ShareCardData | null> {
  if (!token || token.length > 64) return null
  const admin = await createServiceRoleClient()

  // 公開許可表は services(name/color/image_url) のみ。紹介者・説明内部列・money列はselectしない。
  const { data: link, error: linkError } = await admin
    .from('referral_links')
    .select('service_id, services(id,name,color,image_url)')
    .eq('token', token)
    .maybeSingle()
  if (linkError || !link) return null

  const service = oneRelation((link as unknown as { services?: ShareCardService | ShareCardService[] }).services)
  if (!service) return null
  if (!menuId) return { service, menu: null }
  if (!validUuid(menuId)) return null

  // m はリンクのサービス配下にある公開中menuだけを受理。これで解決全体は最大2読取。
  const { data: menu, error: menuError } = await admin
    .from('menus')
    .select('id,name,public_description,service_menus!inner(service_id)')
    .eq('id', menuId)
    .eq('active', true)
    .eq('service_menus.service_id', service.id)
    .maybeSingle()
  if (menuError || !menu) return null
  const allowed = menu as unknown as ShareCardMenu
  return { service, menu: { id: allowed.id, name: allowed.name, public_description: allowed.public_description ?? null } }
}

export const getShareCard = unstable_cache(
  readShareCard,
  ['gen2-share-card-v1'],
  { revalidate: 300 },
)
