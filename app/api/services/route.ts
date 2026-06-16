import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'

export const runtime = 'edge'

// services/menus は全ユーザー共通の不変マスタ。Cookie非依存(service role)で取得し
// CDNキャッシュ可能に（s-maxage=300）→ アイドル後の cold start を回避。認証データは含まない。
export async function GET() {
  const supabase = await createServiceRoleClient()
  const services = await getServicesWithMenus(supabase)
  return NextResponse.json(services, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
