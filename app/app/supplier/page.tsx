import { redirect } from 'next/navigation'
// 統合ダッシュボードへ（旧URL保護・2026-07-13）。本体は app/app/dashboard/SupplierSection.tsx。
export default function SupplierRedirect() { redirect('/app/dashboard#company') }
