/** メニュー別ヒアリング（vendor-redesign後続①）— 案件→メニューの解決（console正典と同一規則）。money非接続。 */
type Db = { from: (t: string) => any }

/** メニュー解決: reward_snapshot.menu_id（menus.id）を優先、無ければ deals.menu_id（service_menus.id）→ menus へ写像。 */
export async function resolveMenuIdForDeal(admin: Db, dealId: string): Promise<string | null> {
  const { data: d } = await admin.from('deals').select('menu_id, reward_snapshot').eq('id', dealId).maybeSingle()
  if (!d) return null
  const snapId = (d.reward_snapshot as { menu_id?: string } | null)?.menu_id
  if (snapId) return snapId
  if (!d.menu_id) return null
  const { data: m } = await admin.from('menus').select('id').eq('service_menu_id', d.menu_id).limit(1)
  return (m ?? [])[0]?.id ?? null
}
