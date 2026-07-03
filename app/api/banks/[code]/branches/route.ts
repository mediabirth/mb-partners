/**
 * GET /api/banks/[code]/branches?q=渋谷 — 支店マスタ検索（公開マスタ・読み取りのみ）。
 * q 空のときはコード順の先頭20件。名称/カナ/ひらがな/コードの部分一致、上限20件。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { normalizeBankQuery } from '@/lib/bank-master'

export const runtime = 'edge'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: 'invalid bank code' }, { status: 400 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 40)
  const service = await createServiceRoleClient()

  let query = service.from('bank_branches').select('code, name, kana').eq('bank_code', code)
  if (q) {
    const { raw, hira, zen } = normalizeBankQuery(q)
    const esc = (s: string) => s.replace(/[%_,()]/g, '')
    const ors = [
      `name.ilike.%${esc(raw)}%`,
      `hira.ilike.%${esc(hira)}%`,
      `kana.ilike.%${esc(raw)}%`,
      `code.ilike.${esc(raw)}%`,
    ]
    if (zen !== raw) ors.push(`name.ilike.%${esc(zen)}%`)
    query = query.or(ors.join(','))
  }
  const { data } = await query.order('code').limit(20)
  // 「本店」「◯◯営業部」「◯◯出張所」等は付けず、通常名のみ「支店」を付ける（全銀マスタは支店抜き表記）
  const withSuffix = (n: string) => /(本店|営業部|出張所|支店|センター|プラザ|市場)$/.test(n) ? n : `${n}支店`
  const branches = (data ?? []).map(b => ({ code: b.code, name: b.name, display: withSuffix(b.name) }))
  return NextResponse.json({ branches }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
