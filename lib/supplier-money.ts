/**
 * サプライヤーのお金サマリ（単一ソース・2026-07-14 洗練プログラム）。
 * ホーム「お金の内訳」とお金ページ「ウォーターフォール」の両方がここを呼ぶ＝数値の乖離不能。
 * ★内訳: 手数料は computeCharges（請求と同一計算）・売上/報酬は deals の表示集計のみ＝独自のmoney計算ゼロ。
 */
import { computeCharges } from '@/lib/supplier-charges'

type Db = { from: (t: string) => any }

export type SupplierWaterfall = {
  companyRevenue: number   // 総受注額（当月成約・自社ブランド）
  rewardsMonth: number     // − パートナー（紹介者）への報酬（deals.amount 合計）
  mbFee: number            // − MB Partners手数料（computeCharges＝請求と同一）
  takeHome: number         // ＝ あなたの会社の手残り
  monthCount: number
}

export async function supplierWaterfall(admin: Db, partnerId: string, ym: string): Promise<SupplierWaterfall> {
  const { data: brands } = await admin.from('services').select('id').eq('supplier_partner_id', partnerId)
  const brandIds = ((brands ?? []) as { id: string }[]).map(b => b.id)
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym
  const [dealsRes, feeRes] = await Promise.all([
    brandIds.length
      ? admin.from('deals').select('id, status, amount, fixed_month, created_at, deal_items(revenue)').in('service_id', brandIds).in('status', ['confirmed', 'paid'])
      : Promise.resolve({ data: [] as never[] }),
    computeCharges(admin as never, partnerId, ym).then(r => r.rows.reduce((s, x) => s + Number(x.amount), 0)).catch(() => 0),
  ])
  const monthClosed = ((dealsRes.data ?? []) as { status: string; amount: number | null; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]).filter(inMonth)
  const companyRevenue = monthClosed.reduce((s, d) => s + (d.deal_items ?? []).reduce((s2, it) => s2 + (Number(it.revenue) || 0), 0), 0)
  const rewardsMonth = monthClosed.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const mbFee = feeRes
  return { companyRevenue, rewardsMonth, mbFee, takeHome: companyRevenue - rewardsMonth - mbFee, monthCount: monthClosed.length }
}

/** 純関数版（無音A・2026-07-18）: 取得済みdeals＋計算済みmbFeeから導出＝ページ側で往復を統合できる。
 *  値の定義は supplierWaterfall と完全同一（同じフィルタ・同じ合算）。 */
export function waterfallFromDeals(
  deals: { status: string; amount: number | null; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[],
  mbFee: number,
  ym: string,
): SupplierWaterfall {
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym
  const monthClosed = deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && inMonth(d))
  const companyRevenue = monthClosed.reduce((s, d) => s + (d.deal_items ?? []).reduce((s2, it) => s2 + (Number(it.revenue) || 0), 0), 0)
  const rewardsMonth = monthClosed.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  return { companyRevenue, rewardsMonth, mbFee, takeHome: companyRevenue - rewardsMonth - mbFee, monthCount: monthClosed.length }
}
