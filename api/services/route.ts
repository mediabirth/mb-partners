import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('services')
    .select('*, service_menus(*)')
    .eq('active', true)
    .order('sort')
  return NextResponse.json(data ?? [])
}
