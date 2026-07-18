/**
 * 復帰ウォームアップ（resume-performance・2026-07-18）。※/api/warm=cron用keep-warmとは別物（こちらはブラウザ復帰時）。
 * visibilitychange復帰時に1発だけ叩かれる軽量エンドポイント。
 *  1) nodejsランタイムを温める（コールドスタート吸収）
 *  2) セッションcookieがあれば getUser() でトークンをプロアクティブに更新（期限切れ時の「最初のクリックが同期リフレッシュ待ちで固まる」を先回りで解消・失敗しても無害）
 *  3) 現在のビルドSHAを返す（クライアントが自分のSHAと比較し、放置中デプロイ→旧チャンク404で操作不能になる前に自動リロード）
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    await supabase.auth.getUser()   // cookieが無ければ即null・あれば必要時にリフレッシュ（Set-Cookieで更新）
  } catch { /* best-effort */ }
  return NextResponse.json({ sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
