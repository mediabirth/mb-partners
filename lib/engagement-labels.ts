/**
 * 「紹介 / 協力」という区分語を表に出さず、関わりの“中身”で呼ぶための呼称。
 * referral   = お客さまをサービスへ「つなぐ」（固定報酬・対応範囲なし）
 * cooperation = 商談〜成約まで「伴走」する（成果報酬＝粗利%・対応範囲あり）
 *
 * ★暫定呼称：勝彦が実運用に合わせて後で差し替える前提。差し替えはこの1ファイルのみで完結する。
 * ★これは表示文字列だけ。deals.channel の値('referral'/'cooperation')・二段レートゲート・
 *   requiredTasksDone・money計算・保存ロジックには一切関与しない。
 */
export type Channel = 'referral' | 'cooperation' | 'direct' | string

export const ENGAGEMENT = {
  referral:    { label: 'つなぐ', chip: 'chip-referral' },
  cooperation: { label: '伴走',   chip: 'chip-cooperation' },
} as const

/** channel 値 → 中身ベースの表示ラベル（direct は実態なので従来どおり「直販」）。 */
export function engagementLabel(channel: Channel): string {
  if (channel === 'cooperation') return ENGAGEMENT.cooperation.label
  if (channel === 'direct') return '直販'
  return ENGAGEMENT.referral.label
}

/** kind('ref'|'coop') → ラベル（refer のメニュー選択カード用）。 */
export function engagementLabelByKind(kind: 'ref' | 'coop'): string {
  return kind === 'coop' ? ENGAGEMENT.cooperation.label : ENGAGEMENT.referral.label
}
