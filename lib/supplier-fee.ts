/**
 * 系統連動レート P0-a（仕様正典: docs/design/lineage-rate-design.md v2）。
 * 「条件の凍結（fee_snapshot・第1段）」と「請求ベース算出」のみを担う。
 * ★computeOverrides / reward_snapshot / deals.amount / payout_* には一切非接触（P0-aの境界）。
 * ★全関数 best-effort：失敗は null / ok 返し（deal作成・確定のmoneyパスを絶対に壊さない）。
 */

type Db = { from: (t: string) => any }

export const STD_RATE_CARD = 'standard-v2' // Feature I-2: 標準の既定（std-v1は未使用のまま廃止・deprecated）
export const OMNIS_FOUNDING_RATE_CARD = 'omnis-founding-v1'
export const OMNIS_MONTHLY_FEE = 50000 // 税別（設計§4(d)）

/** fee_model: half_commission=折半（粗利ベース・個別カード用）／passthrough=報酬パススルー＋受注額(税抜)×revenue_fee_rate */
export type RateCard = { id: string; half_commission_rate: number; payment_fee_rate: number | null; monthly_fee: number | null; override_rate: number; fee_model: 'half_commission' | 'passthrough'; revenue_fee_rate: number | null; deprecated: boolean }
/** レートカードをDBから読む（Feature I・不変版方式）。読取失敗は既存定数へフォールバック（fail-safe）。 */
export async function loadRateCard(db: Db, id: string | null | undefined): Promise<RateCard> {
  const cardId = id || STD_RATE_CARD
  try {
    const { data } = await db.from('rate_cards').select('id, half_commission_rate, payment_fee_rate, monthly_fee, override_rate, fee_model, revenue_fee_rate, deprecated').eq('id', cardId).maybeSingle()
    if (data) return { id: data.id, half_commission_rate: Number(data.half_commission_rate), payment_fee_rate: data.payment_fee_rate == null ? null : Number(data.payment_fee_rate), monthly_fee: data.monthly_fee == null ? null : Number(data.monthly_fee), override_rate: Number(data.override_rate), fee_model: data.fee_model === 'passthrough' ? 'passthrough' : 'half_commission', revenue_fee_rate: data.revenue_fee_rate == null ? null : Number(data.revenue_fee_rate), deprecated: !!data.deprecated }
  } catch { /* fallback */ }
  return cardId === OMNIS_FOUNDING_RATE_CARD
    ? { id: cardId, half_commission_rate: 0.5, payment_fee_rate: null, monthly_fee: OMNIS_MONTHLY_FEE, override_rate: 0.10, fee_model: 'half_commission', revenue_fee_rate: null, deprecated: false }
    : { id: cardId, half_commission_rate: 0.5, payment_fee_rate: 0.05, monthly_fee: null, override_rate: 0.10, fee_model: 'passthrough', revenue_fee_rate: 0.05, deprecated: false }
}

export const FEE_RATE = {
  half_commission: 0.5,   // 折半＝粗利(税抜)の50%（設計§4(a)）
  payment_fee_5: 0.05,    // 決済手数料＝パートナー支払報酬総額(税抜・源泉前)の5%（設計§4(b)）
  corporate_override: 0.10, // 法人override（P0-bで発火・ここでは条件記録のみ）
} as const

export type FeeSnapshot = {
  version: 2
  lineage_kind: 'supplier' | 'mb'
  referrer_partner_id: string | null
  referrer_frontier_id: string | null
  menu_supplier_partner_id: string | null
  self_service: boolean
  cross_supplier: boolean
  rate_kind: 'half_commission' | 'passthrough_revenue_fee' | 'payment_fee_5' | 'corporate_override' | 'omnis_monthly' | 'none'
  direction: 'charge' | 'pay' | 'none'
  rate: number | null
  rate_card_version: string
}

/**
 * 系統判定→条件凍結の内容を解決（設計§1/§2第1段）。
 * 金額は一切入れない（2段凍結）。解決不能・エラー時は null（＝従来案件扱い・後方互換）。
 */
export async function resolveFeeSnapshot(db: Db, args: { partnerId: string | null; serviceId: string | null }): Promise<FeeSnapshot | null> {
  try {
    const { partnerId, serviceId } = args
    // 紹介パートナーの系統（frontier）
    let referrerFrontierId: string | null = null
    if (partnerId) {
      const { data: p } = await db.from('partners').select('frontier_id').eq('id', partnerId).maybeSingle()
      referrerFrontierId = (p?.frontier_id as string | null) ?? null
    }
    // 案件メニューのサプライヤー（services.supplier_partner_id・null=MBメニュー）
    let menuSupplierId: string | null = null
    if (serviceId) {
      const { data: s } = await db.from('services').select('supplier_partner_id').eq('id', serviceId).maybeSingle()
      menuSupplierId = (s?.supplier_partner_id as string | null) ?? null
    }
    // referrer の frontier が「サプライヤー」か（いずれかの services.supplier_partner_id に一致するか）
    let frontierIsSupplier = false
    if (referrerFrontierId) {
      const { data: sv } = await db.from('services').select('id').eq('supplier_partner_id', referrerFrontierId).limit(1)
      frontierIsSupplier = !!(sv && sv.length > 0)
    }
    const selfService = !!referrerFrontierId && !!menuSupplierId && referrerFrontierId === menuSupplierId
    const crossSupplier = frontierIsSupplier && !!menuSupplierId && referrerFrontierId !== menuSupplierId

    // サプライヤーの料率カード（メニュー側サプライヤー基準・null=std）。Feature I: 値はrate_cardsから（不変版）。
    let rateCardId = STD_RATE_CARD
    if (menuSupplierId) {
      const { data: sp } = await db.from('partners').select('supplier_rate_card').eq('id', menuSupplierId).maybeSingle()
      rateCardId = (sp?.supplier_rate_card as string | null) ?? STD_RATE_CARD
    }
    const card = await loadRateCard(db, menuSupplierId ? rateCardId : (referrerFrontierId && frontierIsSupplier ? (await db.from('partners').select('supplier_rate_card').eq('id', referrerFrontierId).maybeSingle()).data?.supplier_rate_card ?? STD_RATE_CARD : STD_RATE_CARD))

    // レート種別の決定（レートカード駆動・設計§0表）
    let rate_kind: FeeSnapshot['rate_kind'] = 'none'
    let direction: FeeSnapshot['direction'] = 'none'
    let rate: number | null = null
    if (!menuSupplierId) {
      // MBメニュー：サプライヤー系統からなら法人override（条件③・発火はP0-b・ここは条件記録のみ）
      if (referrerFrontierId && frontierIsSupplier) { rate_kind = 'corporate_override'; direction = 'pay'; rate = card.override_rate }
    } else if (selfService) {
      // 同系統×自社メニュー（条件④／特例d）。月額モデル（monthly_fee非null）は 'omnis_monthly'（互換名・汎用月額）。
      if (card.monthly_fee != null) { rate_kind = 'omnis_monthly'; direction = 'charge'; rate = null }
      else { rate_kind = 'payment_fee_5'; direction = 'charge'; rate = card.payment_fee_rate ?? FEE_RATE.payment_fee_5 }
    } else {
      // 他系統(MB含む)→サプライヤーメニュー（条件②）。
      // Feature I-2: passthrough カードは「報酬パススルー＋MB手数料=受注額(税抜)×revenue_fee_rate」（粗利ベース折半は個別カード専用）。
      if (card.fee_model === 'passthrough') { rate_kind = 'passthrough_revenue_fee'; direction = 'charge'; rate = card.revenue_fee_rate ?? 0.05 }
      else { rate_kind = 'half_commission'; direction = 'charge'; rate = card.half_commission_rate }
    }
    const rateCard = card.id

    return {
      version: 2,
      lineage_kind: frontierIsSupplier ? 'supplier' : 'mb',
      referrer_partner_id: partnerId ?? null,
      referrer_frontier_id: referrerFrontierId,
      menu_supplier_partner_id: menuSupplierId,
      self_service: selfService,
      cross_supplier: crossSupplier,
      rate_kind, direction, rate,
      rate_card_version: rateCard,
    }
  } catch { return null }
}

/** 条件凍結を deal へ best-effort で書く（列未追加・失敗でも作成/確定を壊さない）。 */
export async function freezeFeeSnapshot(db: Db, dealId: string, args: { partnerId: string | null; serviceId: string | null }): Promise<void> {
  try {
    const snap = await resolveFeeSnapshot(db, args)
    if (!snap) return
    await db.from('deals').update({ fee_snapshot: snap }).eq('id', dealId)
  } catch { /* best-effort */ }
}

/**
 * 折半ベース（設計§4(a)・正式定義＝override控除前）:
 *   受注額(税抜) − 委託費 − 承認済経費 − その他原価
 * ★既存 grossBeforeReward（_frontier_override を控除する）とは別関数＝既存率報酬のbaseには一切非接触。
 */
export function supplierChargeBase(input: { revenue: number; deliveryCost: number; deliveryExpense: number; otherCost: number }): number {
  return Math.round((input.revenue || 0) - (input.deliveryCost || 0) - (input.deliveryExpense || 0) - (input.otherCost || 0))
}

/**
 * サプライヤーメニューの報酬バリデーション（カード駆動・Feature I-2）。
 * - 折半カード（fee_model=half_commission・オムニス等の個別契約）＝逆ザヤ防止（設計§7-7）:
 *   rate/continuous＝50%硬上限（エラー）／fixed＝警告（粗利が案件ごとに変わるため硬ガード不能）。
 * - パススルーカード（standard-v2）＝報酬はMB原資でなくパススルー＝逆ザヤ概念なし。
 *   ただし報酬型は「固定額 or 受注額%（rate×売上ベース）」に限定（粗利%・継続は個別契約カードのみ）。
 * メニューがサプライヤー配下でなければ常にok。判定不能はfail-closed。
 */
export async function validateSupplierReward(db: Db, menuId: string, rewardType: string, rewardValue: number, rewardBase?: string | null): Promise<{ ok: boolean; error?: string; warning?: string }> {
  try {
    const { data: m } = await db.from('menus').select('service_menu_id').eq('id', menuId).maybeSingle()
    if (!m?.service_menu_id) return { ok: true }
    const { data: sm } = await db.from('service_menus').select('service_id').eq('id', m.service_menu_id).maybeSingle()
    if (!sm?.service_id) return { ok: true }
    const { data: sv } = await db.from('services').select('supplier_partner_id').eq('id', sm.service_id).maybeSingle()
    if (!sv?.supplier_partner_id) return { ok: true }
    const { data: sp } = await db.from('partners').select('supplier_rate_card').eq('id', sv.supplier_partner_id).maybeSingle()
    const card = await loadRateCard(db, sp?.supplier_rate_card)
    if (card.fee_model === 'passthrough') {
      // 標準サプライヤー：固定額 or 受注額%（売上ベースrate）のみ。逆ザヤガード不要（パススルー）。
      if (rewardType === 'continuous') {
        return { ok: false, error: '標準サプライヤーのメニュー報酬は「固定額」または「受注額%」のみです（継続報酬は個別契約カードのみ）' }
      }
      if (rewardType === 'rate' && rewardBase !== '売上') {
        return { ok: false, error: '標準サプライヤーの率報酬は「受注額%（売上ベース）」のみです（粗利%は個別契約カードのみ）' }
      }
      return { ok: true }
    }
    // 折半カード（個別契約）＝従来の逆ザヤガード（完全不変）
    if ((rewardType === 'rate' || rewardType === 'continuous') && Number(rewardValue) > 50) {
      return { ok: false, error: '逆ザヤ防止：サプライヤーメニューの率報酬はMB受取50%枠内（50%以下）にしてください' }
    }
    if (rewardType === 'fixed') {
      return { ok: true, warning: 'サプライヤーメニューの固定報酬は案件粗利によりMB受取50%枠を超える可能性があります（運用ガイドライン参照）' }
    }
    return { ok: true }
  } catch { return { ok: false, error: '確認できませんでした。もう一度お試しください' } }
}

/** 帰属月（設計§7-5）＝支払側 close_month_batch と同一規則: fixed_month ?? created_at の YYYY-MM。 */
export function chargePeriodOf(deal: { fixed_month?: string | null; created_at?: string | null }): string {
  return String(deal.fixed_month ?? deal.created_at ?? '').slice(0, 7)
}

/** 受注額の乖離検知（ベンダー純化P2・vendor-redesign.md §3(b)）— 閾値の単一ソース。
 *  ★静音・非ブロック: 判定はフラグ/トーストのみで、保存・請求・報酬計算には一切影響しない。 */
export const REVENUE_DEVIATION = {
  windowDays: 90,        // 同一メニューの参照窓（直近90日）
  minSamples: 3,         // 中央値判定に必要な件数（N>=3）
  ratio: 0.7,            // 中央値±70%超で乖離（N>=3）
  sparseMagnitude: 10,   // N<3: 参照値から1桁（×10/÷10）ずれで乖離（緩い帯）
} as const
