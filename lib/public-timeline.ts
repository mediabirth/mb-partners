/**
 * パートナー／サプライヤーへ公開できる案件進行イベントの唯一の許可表。
 *
 * deal_events には kind 列がないため、本文を完全一致で kind へ変換してから表示する。
 * 未知の本文は default-deny。金額・請求・報酬に関する本文を推測して公開してはならない。
 */
export const PUBLIC_TIMELINE_COPY = {
  director_assigned: '担当が決まりました',
  work_started: '対応を始めました',
  proposal_preparing: 'ご提案の準備を始めました',
  menu_confirmed: 'メニューが決まりました',
  delivery_completed: '納品が完了しました',
} as const

export type PublicTimelineKind = keyof typeof PUBLIC_TIMELINE_COPY

export type PublicTimelineEvent = {
  id: string
  body: string | null
  created_at: string
}

export type PublicTimelineItem = {
  id: string
  kind: PublicTimelineKind
  text: string
  created_at: string
}

// 完全一致のみ。可変値を含むイベント本文は許可表に加えない。
const EXACT_EVENT_KIND: Readonly<Record<string, PublicTimelineKind>> = {
  '担当が決まりました': 'director_assigned',
  'ステータスを「対応中」に変更しました': 'work_started',
  'ご提案の準備を始めました': 'proposal_preparing',
  'ステータスを「成約」に変更しました': 'menu_confirmed',
  'メニューが決まりました': 'menu_confirmed',
  '納品が完了しました': 'delivery_completed',
}

export function publicTimelineKind(body: string | null | undefined): PublicTimelineKind | null {
  if (!body) return null
  return EXACT_EVENT_KIND[body] ?? null
}

export function toPublicTimeline(events: readonly PublicTimelineEvent[]): PublicTimelineItem[] {
  return events.flatMap(event => {
    const kind = publicTimelineKind(event.body)
    return kind
      ? [{ id: event.id, kind, text: PUBLIC_TIMELINE_COPY[kind], created_at: event.created_at }]
      : []
  })
}
