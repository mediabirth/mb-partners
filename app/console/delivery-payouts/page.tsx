import { redirect } from 'next/navigation'
// 支払管理に統合（デリバリー支払タブ）。旧URLは互換のためリダイレクト。
export default function DeliveryPayoutsRedirect() {
  redirect('/console/payouts?tab=delivery')
}
