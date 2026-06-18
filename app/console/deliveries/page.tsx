import { redirect } from 'next/navigation'
// 業務委託先はパートナーページ（デリバリータブ）に統合。旧URLは互換のためリダイレクト。
export default function DeliveriesRedirect() {
  redirect('/console/partners?tab=delivery')
}
