import { redirect } from 'next/navigation'

// 情報再構造化（2026-07-14）: 紹介ファネルはダッシュボード常設セクションへ統合。旧URLはブックマーク保護のためリダイレクト。
export default function ConsoleFunnelRedirect() {
  redirect('/console')
}
