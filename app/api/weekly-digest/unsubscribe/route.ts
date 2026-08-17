import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { logMail } from '@/lib/mail-send'
import { digestWeekKey, verifyDigestUnsubscribe } from '@/lib/weekly-digest'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const payload = verifyDigestUnsubscribe(token)
  if (payload) {
    const admin = await createServiceRoleClient()
    const { data: partner } = await admin.from('partners').select('id, profile_id, profiles(email)').eq('id', payload.partnerId).maybeSingle()
    const profileValue = partner?.profiles as { email?: string | null } | { email?: string | null }[] | null
    const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue
    if (partner?.profile_id) {
      const { data: existing } = await admin.from('member_notification_prefs').select('email_to').eq('user_id', partner.profile_id).maybeSingle()
      const email = existing?.email_to?.trim() || profile?.email?.trim() || null
      const { error } = await admin.from('member_notification_prefs').upsert({
        user_id: partner.profile_id,
        email_to: email,
        email_enabled: false,
      }, { onConflict: 'user_id' })
      if (!error) {
        await logMail({
          template_key: 'weekly-digest-unsubscribe', event: '週次ダイジェスト配信停止',
          to_email: email ?? '(宛先なし)', to_role: 'partner', subject: '週次ダイジェストの配信停止',
          status: 'skipped', detail: '配信停止',
          meta: { partner_id: partner.id, week_key: digestWeekKey(new Date()), event_type: 'unsubscribe' },
        })
      }
    }
  }
  return NextResponse.redirect(new URL('/weekly-digest/unsubscribed', req.url), 303)
}
