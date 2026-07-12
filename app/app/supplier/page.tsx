import { redirect } from 'next/navigation'
// ペルソナ・ホーム（2026-07-13）: サプライヤーのホーム＝ミニコンソール（/app）へ。
export default function SupplierRedirect() { redirect('/app') }
