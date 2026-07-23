/**
 * パートナー別報酬率（P1・仕様正典: docs/design/partner-reward-override-design.md）。
 * 解決の単一ソース: 個別上書き（reward_id指定） ＞ 全メニュー上書き（reward_id null・rate/continuous型のみ） ＞ メニュー正典。
 * ★上書きは「値」のみ（型・ベースは正典に従う）。★解決失敗は正典値へ fail-safe（override無効化方向に倒す）。
 * ★money境界: 本モジュールは menu_rewards/deals/payout_* に書き込まない（読むだけ）。
 */

type Db = { from: (t: string) => any }

export type RewardLikeRow = { id: string; menu_id: string; reward_type: string; reward_value: number }

export type EffectiveReward = {
  value: number
  overridden: boolean
  override_id: string | null
  original_value: number
}

/**
 * 対象パートナー×報酬行の有効値を解決する。
 * supplier配下でないメニュー（menu→service→supplier_partner_id が null）は常に正典値（スコープ＝サプライヤー供給メニューのみ）。
 */
export async function resolveEffectiveReward(db: Db, args: { partnerId: string | null | undefined; reward: RewardLikeRow }): Promise<EffectiveReward> {
  const original = Number(args.reward.reward_value) || 0
  const plain: EffectiveReward = { value: original, overridden: false, override_id: null, original_value: original }
  try {
    if (!args.partnerId) return plain
    // ① 個別上書き（最優先）
    const { data: exact } = await db
      .from('partner_reward_overrides')
      .select('id, override_value')
      .eq('partner_id', args.partnerId)
      .eq('reward_id', args.reward.id)
      .eq('active', true)
      .maybeSingle()
    if (exact) return { value: Number(exact.override_value), overridden: true, override_id: exact.id, original_value: original }

    // ② 全メニュー上書き（rate/continuous型のみ・fixedは対象外＝設計§1.1）
    if (args.reward.reward_type !== 'rate' && args.reward.reward_type !== 'continuous') return plain
    const supplierId = await supplierOfMenu(db, args.reward.menu_id)
    if (!supplierId) return plain // MBメニュー＝スコープ外
    const { data: all } = await db
      .from('partner_reward_overrides')
      .select('id, override_value')
      .eq('partner_id', args.partnerId)
      .eq('supplier_partner_id', supplierId)
      .is('reward_id', null)
      .eq('active', true)
      .maybeSingle()
    if (all) return { value: Number(all.override_value), overridden: true, override_id: all.id, original_value: original }
    return plain
  } catch {
    return plain // fail-safe: 正典値
  }
}

/** menu → service → supplier_partner_id（null=MBメニュー）。 */
export async function supplierOfMenu(db: Db, menuId: string): Promise<string | null> {
  try {
    const { data: m } = await db.from('menus').select('service_menu_id').eq('id', menuId).maybeSingle()
    if (!m?.service_menu_id) return null
    const { data: sm } = await db.from('service_menus').select('service_id').eq('id', m.service_menu_id).maybeSingle()
    if (!sm?.service_id) return null
    const { data: sv } = await db.from('services').select('supplier_partner_id').eq('id', sm.service_id).maybeSingle()
    return (sv?.supplier_partner_id as string | null) ?? null
  } catch { return null }
}

// 個別化は /api/my-reward-overrides（no-store）＋クライアント1箇所マージのみ。
// /api/services（CDN共有キャッシュ）への個別値混入は恒久禁止。
