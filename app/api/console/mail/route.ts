/**
 * GET /api/console/mail — メール管理の概要（磨き①）。
 * レジストリ全キーのDB上書き状態＋送信履歴（mail_log 最新200件）を返す。owner/manager のみ。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { MAIL_REGISTRY } from '@/lib/mail-registry'

export const runtime = 'edge'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = await createServiceRoleClient()
  const keys = MAIL_REGISTRY.map(d => d.key)
  const [tplRes, logRes] = await Promise.all([
    service.from('message_templates')
      .select('id, category, subject, body, is_active, updated_at')
      .in('category', keys)
      .order('created_at', { ascending: false }),
    service.from('mail_log')
      .select('id, template_key, event, to_email, to_role, subject, status, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  // category ごとに最新1件（resolveMailOverride と同じ解決順）
  const overrides: Record<string, { id: string; subject: string | null; body: string | null; is_active: boolean; updated_at: string }> = {}
  for (const t of (tplRes.data ?? []) as { id: string; category: string; subject: string | null; body: string | null; is_active: boolean; updated_at: string }[]) {
    if (!overrides[t.category]) overrides[t.category] = { id: t.id, subject: t.subject, body: t.body, is_active: t.is_active, updated_at: t.updated_at }
  }

  return NextResponse.json({ overrides, logs: logRes.data ?? [] })
}
