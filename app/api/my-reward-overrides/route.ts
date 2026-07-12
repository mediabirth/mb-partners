import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * P1 パートナー別報酬率: 本人の個別条件（表示個別化用の差分）を返す認証必須エンドポイント。
 * ★境界の正典（設計§4.2）: /api/services は全ユーザー共通の正典マスタとして CDN 共有キャッシュされるため、
 *   個別値をあちらに混ぜることは【恒久禁止】（キャッシュ汚染＝他人への漏出）。個別化は本エンドポイント
 *  （セッション由来 partner・Cache-Control: no-store）＋クライアント1箇所マージでのみ行う。
 * ★値のみ（型・ベースは正典）。返すのは自分の差分だけ＝他パートナーの条件は構造的に取得不可。
 */
export const runtime = 'edge'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).maybeSingle()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const empty = { byReward: {}, bySupplier: {}, supplierByMenu: {} }
  try {
    const { data: ovs } = await admin
      .from('partner_reward_overrides')
      .select('reward_id, supplier_partner_id, override_value')
      .eq('partner_id', partner.id)
      .eq('active', true)
    const list = (ovs ?? []) as { reward_id: string | null; supplier_partner_id: string; override_value: number }[]
    if (!list.length) return NextResponse.json(empty, { headers: { 'Cache-Control': 'no-store' } })

    const byReward: Record<string, number> = {}
    const bySupplier: Record<string, number> = {}
    for (const o of list) {
      if (o.reward_id) byReward[o.reward_id] = Number(o.override_value)
      else bySupplier[o.supplier_partner_id] = Number(o.override_value)
    }
    // 全メニュー上書きの解決に必要な menu→supplier 対応（supplier結線ブランド配下のみ・有限）
    const supplierByMenu: Record<string, string> = {}
    if (Object.keys(bySupplier).length) {
      const { data: svs } = await admin.from('services').select('id, supplier_partner_id').in('supplier_partner_id', Object.keys(bySupplier))
      const svIds = (svs ?? []).map((s: { id: string }) => s.id)
      if (svIds.length) {
        const { data: sms } = await admin.from('service_menus').select('id, service_id').in('service_id', svIds)
        const supBySm: Record<string, string> = {}
        for (const sm of (sms ?? []) as { id: string; service_id: string }[]) {
          const sv = (svs ?? []).find((s: { id: string }) => s.id === sm.service_id) as { supplier_partner_id: string } | undefined
          if (sv) supBySm[sm.id] = sv.supplier_partner_id
        }
        const smIds = Object.keys(supBySm)
        if (smIds.length) {
          const { data: mn } = await admin.from('menus').select('id, service_menu_id').in('service_menu_id', smIds)
          for (const m of (mn ?? []) as { id: string; service_menu_id: string }[]) supplierByMenu[m.id] = supBySm[m.service_menu_id]
        }
      }
    }
    return NextResponse.json({ byReward, bySupplier, supplierByMenu }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(empty, { headers: { 'Cache-Control': 'no-store' } }) // fail-safe: 正典表示
  }
}
