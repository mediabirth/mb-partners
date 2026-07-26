/**
 * 協力タスクの表示解決の単一ソース。
 * ★一覧のタスクピル ＝ 登録ページの協力タスクチェック項目 を同じコードから出す構造的保証。
 *   突合順は instantiateDealTasks と同一（reward_id 紐付き優先→無ければメニュー/サービス共通）。
 *   本関数に渡す taskDetails は queries.attachCoverageTasks の解決済み集合（reward_id→menu_id→service null-match）。
 * ★タスク名はデータ（テンプレ label）。表示順の調整のみ行い、表示ラベルはハードコードしない。
 */
export type CoopTaskItem = { label: string; description: string | null }

// 新規正典は「ヒアリング」。既存DBの旧表記はbackfillせず、読取・一致判定だけ両表記を受理する。
const HEARING_MARKS = ['ヒアリング', 'ヒヤリング'] as const
export function isHearingTaskText(value: string | null | undefined): boolean {
  return HEARING_MARKS.some(mark => (value ?? '').includes(mark))
}
export function sameCoopTaskLabel(a: string, b: string): boolean {
  return a === b || (isHearingTaskText(a) && isHearingTaskText(b))
}

/** メニュー×報酬の協力タスク集合。dedupe→入力枠タスク（両表記受理）を最下部→fixed（連絡のみ）は先頭1件。 */
export function resolveMenuCoopTasks(taskDetails: CoopTaskItem[] | null | undefined, rewardType?: string | null): CoopTaskItem[] {
  const seen = new Set<string>()
  const uniq: CoopTaskItem[] = []
  for (const t of taskDetails ?? []) { if (t && t.label && !seen.has(t.label)) { seen.add(t.label); uniq.push(t) } }
  // ヒアリング（入力枠を伴うタスク）は常に最下部（表示順のみ・stable sort）。
  const ordered = [...uniq].sort((a, b) => (isHearingTaskText(a.label) ? 1 : 0) - (isHearingTaskText(b.label) ? 1 : 0))
  // fixed（連絡のみ・協力タスク非実体化）は先頭1件のみ。rate/continuous は全件。
  return rewardType === 'fixed' ? ordered.slice(0, 1) : ordered
}
