/**
 * 案件詳細の「報酬到達文言」（⑥）＋「いまの状況ナラティブ」（⑦）。
 * ★money計算・reward_snapshot の書込には一切触れない。ステータス→文言の表示写像のみ。
 * 将来データ化できるよう定数マップとして分離（コード定数・現時点は静的）。
 */
export type DealStatusKey = 'received' | 'in_progress' | 'confirmed' | 'paid'

// ⑥ 報酬到達文言のプレフィックス（金額 {reward} は呼び出し側で 500 太字にして連結）。
//   受付/対応中=「成約すると {reward}」／成約=「報酬が確定しました {reward}」／支払済=「お支払い済み {reward}」。
//   lost・未知ステータスは null（表示しない）。
export function rewardReachPrefix(status: string): string | null {
  switch (status) {
    case 'received':
    case 'in_progress': return '成約すると'
    case 'confirmed':   return '報酬が確定しました'
    case 'paid':        return 'お支払い済み'
    default:            return null
  }
}

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
