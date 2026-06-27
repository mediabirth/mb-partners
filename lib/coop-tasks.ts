/**
 * Batch P: 協力＝タスク達成型のヘルパー。
 * すべて best-effort / fail-open：タスク基盤（DDL）が無い間は no-op で、
 * 既存の deal 作成・商談設定・成約レート決定を一切壊さない。
 * service_role クライアントを受け取る（deal_tasks/templates は service_role のみ）。
 */
type AdminClient = { from: (t: string) => any }

type DealLike = { id: string; service_id: string; menu_id?: string | null; menu_ref?: string | null; channel: string }

/**
 * 協力deal作成時：テンプレから deal_tasks を生成。冪等(unique)。
 * 新モデル＝メニュー単位タスクが正：deal.menu_ref（新 menus）固有タスク(menu_id一致)があればそれだけを使う。
 * 無ければ従来どおり（サービス共通 menu_id=null ＋ 旧 service_menu 一致）にフォールバック。
 * ★これはタスク（報酬ゲート requiredTasksDone の対象）の生成のみ。reward 計算式 base×value/100 には触れない。
 */
export async function instantiateDealTasks(admin: AdminClient, deal: DealLike): Promise<number> {
  if (deal.channel !== 'cooperation') return 0
  try {
    const { data: tpls, error } = await admin
      .from('cooperation_task_templates')
      .select('id, label, kind, required, trigger_key, sort, menu_id')
      .eq('service_id', deal.service_id).eq('active', true).order('sort')
    if (error || !tpls?.length) return 0
    const menuSpecific = deal.menu_ref
      ? tpls.filter((t: { menu_id: string | null }) => t.menu_id === deal.menu_ref)
      : []
    const matched = menuSpecific.length > 0
      ? menuSpecific
      : tpls.filter((t: { menu_id: string | null }) => t.menu_id == null || t.menu_id === deal.menu_id)
    if (!matched.length) return 0
    const rows = matched.map((t: { id: string; label: string; kind: string; required: boolean; trigger_key: string | null; sort: number }) => ({
      deal_id: deal.id, template_id: t.id, label: t.label, kind: t.kind, required: t.required, trigger_key: t.trigger_key, sort: t.sort,
    }))
    const { error: insErr } = await admin.from('deal_tasks').insert(rows)
    if (insErr) return 0
    return rows.length
  } catch { return 0 }
}

/** システムイベント発火：該当 trigger_key の auto タスクを done に（冪等・best-effort）。 */
export async function markAutoTaskDone(admin: AdminClient, dealId: string, triggerKey: string): Promise<void> {
  try {
    await admin.from('deal_tasks')
      .update({ done: true, done_at: new Date().toISOString() })
      .eq('deal_id', dealId).eq('trigger_key', triggerKey).eq('done', false)
  } catch { /* best-effort */ }
}

/**
 * 必須タスク全完了か（報酬ゲート判定）。
 * fail-open：テーブル未作成（DDL前）や読取エラーは true（ゲート無効＝従来レート）を返す。
 * 必須タスクが1つも無い deal も true（通過）。
 */
export async function requiredTasksDone(admin: AdminClient, dealId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('deal_tasks').select('required, done').eq('deal_id', dealId).eq('required', true)
    if (error) return true
    if (!data || data.length === 0) return true
    return data.every((t: { done: boolean }) => t.done)
  } catch { return true }
}
