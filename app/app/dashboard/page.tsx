import { redirect } from 'next/navigation'
// ペルソナ・ホーム（2026-07-13）: ダッシュボードは廃止＝ホームが役割適応。部品（各Section）は本ディレクトリに残置し各ホームが使用。
export default function DashboardRedirect() { redirect('/app') }
