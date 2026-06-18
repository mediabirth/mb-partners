/**
 * vendor 認証ヘルパ（サーバ）。ログインユーザーが role='vendor' かつ deliveries に紐付いていることを検証し、
 * 自分の delivery（id）を返す。/vendor の全 API/ページはここを通して本人の delivery に限定する。
 */
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function resolveVendor(): Promise<{ userId: string; deliveryId: string; deliveryName: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'vendor') return null
  const admin = await createServiceRoleClient()
  const { data: delivery } = await admin.from('deliveries').select('id, name').eq('auth_user_id', user.id).maybeSingle()
  if (!delivery) return null
  return { userId: user.id, deliveryId: delivery.id, deliveryName: delivery.name }
}

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
