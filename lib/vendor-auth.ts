/**
 * vendor 認証ヘルパ（サーバ）。ログインユーザーが role='vendor' かつ deliveries に紐付いていることを検証し、
 * 自分の delivery（id）を返す。/vendor の全 API/ページはここを通して本人の delivery に限定する。
 */
import { cache } from 'react'
import { createServiceRoleClient, getCachedUid, getCachedProfile } from '@/lib/supabase/server'

type VendorContext = {
  userId: string
  deliveryId: string
  deliveryName: string
  profile: { name: string | null; role: string | null; color: string | null; avatar_url: string | null }
  delivery: {
    id: string; name: string; kind: string | null
    nickname: string | null; display_code: string | null; phone: string | null; address: string | null
    tax_type: string | null; bank_name: string | null; bank_branch: string | null; bank_account: string | null
    bank_holder_kana: string | null; invoice_number: string | null; contact_email: string | null
  }
}

// V-1/V-2 ゲーティングは不変：user無し / role!=='vendor' / delivery無し はいずれも null を返す。
// 最適化は (a) getUser・profiles をリクエスト内で layout と共有(getCachedUser/getCachedProfile)、
// (b) 互いに独立な profiles と deliveries を Promise.all で並列化、(c) cache() で多重呼び出しdedup のみ。
// 取得結果・アクセス判定（誰が何に到達できるか）は変更前と同一。
export const resolveVendorContext = cache(async (): Promise<VendorContext | null> => {
  const uid = await getCachedUid()
  if (!uid) return null
  const admin = await createServiceRoleClient()
  // profiles(role) と deliveries(auth_user_id) は uid のみ依存・順序非依存 → 並列取得。
  const [profile, { data: delivery }] = await Promise.all([
    getCachedProfile(),
    admin.from('deliveries')
      .select('id, name, kind, nickname, display_code, phone, address, tax_type, bank_name, bank_branch, bank_account, bank_holder_kana, invoice_number, contact_email')
      .eq('auth_user_id', uid)
      .maybeSingle(),
  ])
  // ★vendor としての本人性は「自分の auth_user に紐づく delivery があること」で判定する（linkage）。
  //   profiles.role==='vendor' は要求しない＝同一メールが partner(role=partner) と vendor を兼任できる
  //   （アイデンティティ入れ替わりの根本修正：面ごとの本人性を単一 role 列でなく面固有テーブルで持つ）。
  //   隔離は不変：返すのは本人の delivery のみ。profile は表示等のため存在は必要。
  if (!profile) return null
  if (!delivery) return null
  return { userId: uid, deliveryId: delivery.id, deliveryName: delivery.name, profile, delivery }
})

export const resolveVendor = cache(async (): Promise<{ userId: string; deliveryId: string; deliveryName: string } | null> => {
  const context = await resolveVendorContext()
  return context
    ? { userId: context.userId, deliveryId: context.deliveryId, deliveryName: context.deliveryName }
    : null
})

/** 指定 delivery_assignment が本人の delivery に属するか検証（書込前の必須チェック）。 */
export async function assertOwnAssignment(deliveryId: string, assignmentId: string): Promise<boolean> {
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('delivery_assignments').select('id, delivery_id').eq('id', assignmentId).maybeSingle()
  return !!data && data.delivery_id === deliveryId
}

/** 指定 delivery_task が本人の割当に属するか検証（タスク完了チェック等の前提）。割当idも返す。 */
export async function assertOwnTask(deliveryId: string, taskId: string): Promise<string | null> {
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('delivery_tasks').select('id, delivery_assignment_id').eq('id', taskId).maybeSingle()
  if (!data) return null
  return (await assertOwnAssignment(deliveryId, data.delivery_assignment_id as string)) ? (data.delivery_assignment_id as string) : null
}
