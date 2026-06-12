import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { E2E } from './test-constants'

function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 1) continue
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* ignore */ }
}
loadEnvLocal()

export default async function globalTeardown() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!SUPABASE_URL || !SERVICE_KEY) return

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load test data IDs
  const testDataPath = resolve(__dirname, '.test-data.json')
  let testData: any = {}
  if (existsSync(testDataPath)) {
    try { testData = JSON.parse(readFileSync(testDataPath, 'utf-8')) } catch { /* ignore */ }
  }

  const { adminId, partnerId, partnerRecordId, serviceId } = testData

  // ── Delete in dependency order ─────────────────────────────────

  // 1. deal_events for test deals
  if (partnerRecordId) {
    const { data: testDeals } = await service.from('deals')
      .select('id').eq('partner_id', partnerRecordId)
    if (testDeals?.length) {
      await service.from('deal_events').delete()
        .in('deal_id', testDeals.map(d => d.id))
    }
  }

  // 2. notifications for test partner
  if (partnerRecordId) {
    await service.from('notifications').delete().eq('partner_id', partnerRecordId)
  }

  // 3. test deals (all with E2Eテスト prefix, or by partner)
  await service.from('deals').delete().like('customer_name', 'E2Eテスト%')

  // 4. referral links
  if (serviceId) {
    await service.from('referral_links').delete().eq('service_id', serviceId)
  }

  // 5. partner record
  if (partnerRecordId) {
    await service.from('partners').delete().eq('id', partnerRecordId)
  }

  // 6. service menus
  if (serviceId) {
    await service.from('service_menus').delete().eq('service_id', serviceId)
  }

  // 7. service
  if (serviceId) {
    await service.from('services').delete().eq('id', serviceId)
  }

  // 8. profiles
  const profileIds = [adminId, partnerId].filter(Boolean)
  if (profileIds.length) {
    await service.from('profiles').delete().in('id', profileIds)
  }

  // 9. auth users
  for (const uid of [adminId, partnerId].filter(Boolean)) {
    try { await service.auth.admin.deleteUser(uid) } catch { /* ignore if already deleted */ }
  }

  console.log('[teardown] ✓ test data cleaned up')
}
