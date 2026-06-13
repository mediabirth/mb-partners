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

  const { adminId, partnerId, partner2Id, partnerRecordId, partner2RecordId, serviceId } = testData

  // ── M6: invites 削除（invited user cleanup は m6a spec の afterAll が担当）
  await service.from('invites').delete().like('email', '%@mb-partners.test')

  // ── Delete in dependency order ─────────────────────────────────

  const allPartnerRecordIds = [partnerRecordId, partner2RecordId].filter(Boolean)

  // 1. deal_events for test deals
  const { data: testDeals } = await service.from('deals').select('id').like('customer_name', 'E2Eテスト%').then(r => r)
  if (testDeals?.length) {
    await service.from('deal_events').delete().in('deal_id', testDeals.map(d => d.id))
  }

  // 2. notifications for test partners
  if (allPartnerRecordIds.length) {
    await service.from('notifications').delete().in('partner_id', allPartnerRecordIds)
  }

  // 3. payout_items + payout_batches for test month
  if (allPartnerRecordIds.length) {
    await service.from('payout_items').delete().in('partner_id', allPartnerRecordIds)
  }
  await service.from('payout_batches').delete().eq('month', '2026-06-01')

  // 4. test deals (all with E2Eテスト prefix)
  await service.from('deals').delete().like('customer_name', 'E2Eテスト%')
  await service.from('deals').delete().like('customer_name', 'E2E%')

  // 4b. M5 test data: meetings → calendar_links (FK制約あり)
  if (allPartnerRecordIds.length) {
    await service.from('meetings').delete().in('partner_id', allPartnerRecordIds)
    await service.from('calendar_links').delete().in('partner_id', allPartnerRecordIds)
  }

  // 5. referral links
  if (serviceId) {
    await service.from('referral_links').delete().eq('service_id', serviceId)
  }

  // 6. partner records
  if (allPartnerRecordIds.length) {
    await service.from('partners').delete().in('id', allPartnerRecordIds)
  }

  // 7. service menus
  if (serviceId) {
    await service.from('service_menus').delete().eq('service_id', serviceId)
  }

  // 8. service
  if (serviceId) {
    await service.from('services').delete().eq('id', serviceId)
  }

  // 9. profiles
  const profileIds = [adminId, partnerId, partner2Id].filter(Boolean)
  if (profileIds.length) {
    await service.from('profiles').delete().in('id', profileIds)
  }

  // 10. auth users
  for (const uid of [adminId, partnerId, partner2Id].filter(Boolean)) {
    try { await service.auth.admin.deleteUser(uid) } catch { /* ignore if already deleted */ }
  }

  console.log('[teardown] ✓ test data cleaned up')
}
