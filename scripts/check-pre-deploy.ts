/**
 * Pre-deploy verification: partners, backup tables, supabase URL
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const c = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  for (const l of c.split('\n')) {
    const i = l.indexOf('='); if (i < 1) continue
    const key = l.slice(0, i).trim(); let val = l.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

console.log('=== SUPABASE URL ===')
console.log(SUPABASE_URL)

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  // 1. Partners
  const { data: partners } = await svc.from('partners').select('id,code,status,profile_id')
  console.log('\n=== PARTNERS ===')
  partners?.forEach(p => console.log(JSON.stringify(p)))
  console.log(`Total: ${partners?.length}件`)

  // Profiles for partners
  const profileIds = partners?.map(p => p.profile_id).filter(Boolean) ?? []
  const { data: profiles } = await svc.from('profiles').select('id,name,email,role').in('id', profileIds)
  console.log('\n=== PROFILES (for partners) ===')
  profiles?.forEach(p => console.log(JSON.stringify(p)))

  // 2. Check backup tables via REST (will error if not exist)
  console.log('\n=== BACKUP TABLES ===')
  const tables = ['_bk_deals', '_bk_deal_events', '_bk_service_menus', '_bk_services', '_bk_referral_links', '_bk_partners', '_bk_profiles']
  for (const t of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${t}?limit=1`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    })
    if (res.ok) {
      console.log(`  ✓ ${t} exists`)
    } else {
      const body = await res.text()
      console.log(`  ✗ ${t}: ${res.status} — ${body.slice(0, 80)}`)
    }
  }

  // 3. Current state dump (for audit trail)
  const { data: services } = await svc.from('services').select('*').order('name')
  const { data: menus } = await svc.from('service_menus').select('*').order('service_id,sort')
  const { data: deals } = await svc.from('deals').select('id,customer_name,service_id,menu_id,status,channel')
  const { data: allPartners } = await svc.from('partners').select('id,code,status,profile_id')
  const { data: allProfiles } = await svc.from('profiles').select('id,name,email,role')

  const dump = {
    timestamp: new Date().toISOString(),
    supabase_url: SUPABASE_URL,
    services,
    service_menus: menus,
    deals,
    partners: allPartners,
    profiles: allProfiles,
  }
  const outPath = resolve(__dirname, '../scripts/post-migration-dump.json')
  writeFileSync(outPath, JSON.stringify(dump, null, 2))
  console.log(`\n=== DUMP SAVED → scripts/post-migration-dump.json ===`)
  console.log(`services: ${services?.length}, menus: ${menus?.length}, deals: ${deals?.length}, partners: ${allPartners?.length}, profiles: ${allProfiles?.length}`)
}
main().catch(console.error)
