/**
 * 案件詳細の「いまの状況ナラティブ」（⑦）。
 * ★money計算・reward_snapshot の書込には一切触れない。ステータス→文言の表示写像のみ。
 * 将来データ化できるよう定数マップとして分離（コード定数・現時点は静的）。
 *
 * 整合性プログラム決定②: 報酬到達文言（「成約すると ¥30,000」等）は全種削除し、
 * ヘッダの報酬ピルに一本化（rewardReachPrefix は撤去済み）。
 */
export type DealStatusKey = 'received' | 'in_progress' | 'confirmed' | 'paid'

// ⑦ いまの状況ナラティブ（協力タスク0件＝つなぐだけの案件）。title 必須・sub 任意。
export const STATUS_NARRATIVE: Record<DealStatusKey, { title: string; sub: string }> = {
  received:    { title: 'MBがお客さまへの最初のご連絡を準備しています', sub: 'ご連絡がつき次第、状況がここに更新されます。' },
  in_progress: { title: 'MBがお客さまと商談を進めています',           sub: '進展があり次第、ここに更新されます。' },
  confirmed:   { title: '成約となりました。お支払い手続きを進めています', sub: '' },
  paid:        { title: 'お支払いが完了しました。ご紹介ありがとうございました', sub: '' },
}

export function statusNarrative(status: string): { title: string; sub: string } | null {
  return (STATUS_NARRATIVE as Record<string, { title: string; sub: string }>)[status] ?? null
}
