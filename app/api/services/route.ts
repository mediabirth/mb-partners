import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'

export const runtime = 'edge'

export async function GET() {
  const supabase = await createClient()
  const services = await getServicesWithMenus(supabase)
  return NextResponse.json(services)
}
