import { redirect } from 'next/navigation'

// 情報再構造化（2026-07-14）: サプライヤー請求は「支払」に統合。旧URLはブックマーク保護のためタブ着地でリダイレクト。
export default function SupplierChargesRedirect() {
  redirect('/console/payouts?tab=charges')
}
