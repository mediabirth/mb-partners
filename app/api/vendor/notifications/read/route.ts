import { NextRequest, NextResponse } from 'next/server'
import { resolveVendor } from '@/lib/vendor-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { deriveVendorNotifs, loadVendorBundle } from '@/lib/vendor-data'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const requested: string[] | null = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((id: unknown): id is string => typeof id === 'string').slice(0, 100)
    : null
  const bundle = await loadVendorBundle()
  if (!bundle) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const ownIds = new Set(deriveVendorNotifs(bundle).map(notification => notification.id))
  const adding = requested ? requested.filter(id => ownIds.has(id)) : [...ownIds]

  const admin = await createServiceRoleClient()
  const { data, error } = await admin.auth.admin.getUserById(vendor.userId)
  if (error || !data.user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const previous = Array.isArray(data.user.user_metadata?.vendor_notification_reads)
    ? (data.user.user_metadata.vendor_notification_reads as unknown[]).filter((id: unknown): id is string => typeof id === 'string' && ownIds.has(id))
    : []
  const merged = [...new Set([...previous, ...adding])].slice(-200)
  const { error: updateError } = await admin.auth.admin.updateUserById(vendor.userId, {
    user_metadata: { ...data.user.user_metadata, vendor_notification_reads: merged },
  })
  if (updateError) return NextResponse.json({ error: '既読にできませんでした' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
