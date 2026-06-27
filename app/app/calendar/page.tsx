import { redirect } from 'next/navigation'

// ① 予約土台の整理：パートナー個人カレンダー連携（calendar_links）UIは撤去。
// 予約の空き枠はMB運営カレンダー（mb_calendar）一本が基準（協力商談はMBが同席するため）。
// 残骸リンク対策：/app/calendar は /app へリダイレクト（calendar_links テーブルはDROPせず存置）。
export const runtime = 'edge'

export default function CalendarRemoved() {
  redirect('/app')
}
