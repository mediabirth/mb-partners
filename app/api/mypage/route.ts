import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

/**
 * PATCH /api/mypage — 設定の基本情報を直接更新（B: 「変更を申請」制度の廃止）。
 * 氏名 → profiles.name、電話/住所/インボイス番号 → partners（本人行のみ・お金系非接触）。
 * 旧実装は nickname のみDB保存で、phone/address/invoice は localStorage 止まりだった（A4根因）。
 * nickname は廃止（UIから撤去・列は deprecate として残置）。
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : undefined
  const name = str(body.name, 60)
  const phone = str(body.phone, 20)
  const address = str(body.address, 200)
  const invoiceNumber = str(body.invoice_number, 20)

  if (name !== undefined && !name) return NextResponse.json({ error: 'お名前を入力してください' }, { status: 400 })
  if (invoiceNumber) {
    const normalized = invoiceNumber.toUpperCase().replace(/[ｔ]/g, 'T')
    if (!/^T\d{13}$/.test(normalized)) {
      return NextResponse.json({ error: 'インボイス登録番号は「T+13桁の数字」で入力してください' }, { status: 400 })
    }
  }

  if (name !== undefined) {
    const { error } = await supabase.from('profiles').update({ name }).eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (phone !== undefined || address !== undefined || invoiceNumber !== undefined) {
    const admin = await createServiceRoleClient()
    const fields: Record<string, string | null> = {}
    if (phone !== undefined) fields.phone = phone || null
    if (address !== undefined) fields.address = address || null
    if (invoiceNumber !== undefined) fields.invoice_number = invoiceNumber ? invoiceNumber.toUpperCase() : null
    const { error } = await admin.from('partners').update(fields).eq('profile_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
