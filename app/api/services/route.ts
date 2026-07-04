import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'

export const runtime = 'edge'

// services/menus は全ユーザー共通の不変マスタ。Cookie非依存(service role)で取得し
// CDNキャッシュ可能に（s-maxage=300）→ アイドル後の cold start を回避。認証データは含まない。
export async function GET() {
  const supabase = await createServiceRoleClient()
  const services = await getServicesWithMenus(supabase)
  // ★services マスタは常に複数件存在する不変マスタ。空配列＝取得失敗（DB一時障害/cold start等）と断定する。
  //   これを 200 [] で返すと APP は「サービスがない」を描画し、クライアント SWR は
  //   shouldRetryOnError:false で復帰不能になる（＝コンソールは server-read で出るが APP は client-fetch が
  //   一度失敗すると貼り付く「見え方が割れる」事故の正体）。よって空は 200 ではなく 503(no-store) で返し、
  //   クライアントに「エラー＝リトライ」させる。中身がある時だけ CDN キャッシュ可。
  if (!services || services.length === 0) {
    return NextResponse.json(
      { error: 'services_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return NextResponse.json(services, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' },
  })
}
