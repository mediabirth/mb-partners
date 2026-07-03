/**
 * GET /api/banks?q=みずほ — 銀行マスタ検索（公開マスタ・読み取りのみ）。
 * q 空のときは主要行を返す。名称/カナ/ひらがな/コードの部分一致、上限20件。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { normalizeBankQuery, MAJOR_BANK_CODES, bankDisplayName } from '@/lib/bank-master'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 40)
  const service = await createServiceRoleClient()

  let rows: { code: string; name: string; kana: string | null }[] = []
  if (!q) {
    const { data } = await service.from('banks').select('code, name, kana').in('code', MAJOR_BANK_CODES)
    rows = (data ?? []).sort((a, b) => MAJOR_BANK_CODES.indexOf(a.code) - MAJOR_BANK_CODES.indexOf(b.code))
  } else {
    const { raw, hira, zen } = normalizeBankQuery(q)
    const esc = (s: string) => s.replace(/[%_,()]/g, '')
    const ors = [
      `name.ilike.%${esc(raw)}%`,
      `hira.ilike.%${esc(hira)}%`,
      `kana.ilike.%${esc(raw)}%`,
      `code.ilike.${esc(raw)}%`,
    ]
    if (zen !== raw) ors.push(`name.ilike.%${esc(zen)}%`)
    const { data } = await service
      .from('banks').select('code, name, kana')
      .or(ors.join(','))
      .order('code')
      .limit(20)
    rows = data ?? []
  }

  const banks = rows.map(b => ({ code: b.code, name: b.name, display: bankDisplayName(b.name) }))
  return NextResponse.json({ banks }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
