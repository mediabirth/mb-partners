import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'

export const runtime = 'edge'

// services/menus は全ユーザー共通の不変マスタ。Cookie非依存(service role)で取得し
// CDNキャッシュ可能に（s-maxage=300）→ アイドル後の cold start を回避。認証データは含まない。
export async function GET() {
  const supabase = await createServiceRoleClient()
  const services = await getServicesWithMenus(supabase)
  // ★毒入りキャッシュ防止：マスタ取得が（デプロイ瞬間の一時失敗等で）空になった場合は
  // 絶対に CDN キャッシュさせない。空配列が s-maxage で最大15分 stale 配信され
  // 「サービスがない」状態が貼り付く事故を恒久的に塞ぐ。中身がある時だけキャッシュ可。
  const headers = services.length > 0
    ? { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    : { 'Cache-Control': 'no-store' }
  return NextResponse.json(services, { headers })
}
