import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * apexルート「/」＝パートナー面の入口（2026-07-11 招待動線修理）。
 * - APPセッションあり → /app ホームへ。なし → /login（APPのログイン）へ。
 * - ★運営コンソールへの誘導は apex 上に一切置かない（招待された一般パートナーが
 *   運営ログイン画面を見ること自体が誤り＝旧実装の /console・/console/login への redirect は撤去）。
 * - vendor ロール → /vendor。vendorセッションしか無い場合：ルートは app サーフェス
 *   （mb-auth-app）しか読まないため「セッションなし」と同じ＝/login に着地（仕様として定義）。
 * - partner ロールで partners 行が無い（削除済み等の異常系）は /app へ戻さず（/app 側が
 *   「/」へ戻すためループする）、案内メッセージを描画して停止する。
 * - profile/partner の参照は service role（RLSの影響で読めず誤ルーティングする事故を排除）。
 */
export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = await createServiceRoleClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role === 'vendor') redirect('/vendor')

  if (profile?.role === 'partner') {
    const { data: partner } = await admin.from('partners').select('id').eq('profile_id', user.id).maybeSingle()
    if (partner) redirect('/app')
    // 異常系：ループもコンソール誘導もせず、その場で案内（稀：削除済みパートナー等）。
    return (
      <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 10 }}>アカウントの確認が必要です</h1>
          <p style={{ fontSize: '.82rem', lineHeight: 1.8, color: '#54506e' }}>
            パートナー情報が見つかりませんでした。お手数ですが、招待メールの送り主（運営）までご連絡ください。
          </p>
        </div>
      </main>
    )
  }

  // 運営ロール（owner/manager等）のAPPセッション：/app へ（コンソールURLはルートからは発行しない。
  // /app 側の既存ガードがロールに応じて処理する）。
  redirect('/app')
}
