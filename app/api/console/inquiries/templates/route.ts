import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TEMPLATES = [
  { id: '1', label: 'ご確認ありがとうございます', body: 'お問い合わせありがとうございます。ご確認のうえ、改めてご連絡いたします。' },
  { id: '2', label: '対応完了', body: 'ご対応が完了いたしました。ご不明な点がございましたらお気軽にお申し付けください。' },
  { id: '3', label: '追加情報のご確認', body: '恐れ入りますが、詳細について追加情報をご提供いただけますでしょうか。' },
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ templates: TEMPLATES })
}
