/**
 * 是正2：「紹介/協力」「つなぐ/伴走」という関わり方の区分語は画面に一切出さない。
 * deals.channel の内部値('referral'/'cooperation'/'direct')・二段レートゲート・requiredTasksDone・
 * money計算・保存ロジックは保持するが、表示用ラベルは空（区分そのものを見せない）。
 * 各メニューは「名前・報酬・トリガー・協力タスク」の条件として見せる（区分は出さない）。
 */
export type Channel = 'referral' | 'cooperation' | 'direct' | string

/** channel 値 → 表示ラベル。区分語は出さない（direct のみ実態として「直販」）。 */
export function engagementLabel(channel: Channel): string {
  return channel === 'direct' ? '直販' : ''
}
