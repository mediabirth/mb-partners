import { redirect } from 'next/navigation'

export const runtime = 'edge'

// ベンダー純化P1: スケジュール（PM残滓）は撤去。旧URLのブックマーク/履歴はホームへ（404にしない）。
export default function VendorSchedule() {
  redirect('/vendor')
}
