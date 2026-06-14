import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

// Returns the currently logged-in admin's profile (name / email / color / role).
// Read-only — used to unify account display across the console (sidebar, settings, admin list).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({}, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, color, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({}, { status: 404 })
  return NextResponse.json(profile)
}
