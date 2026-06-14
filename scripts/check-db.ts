/**
 * DB state inspection — run from app/ directory
 * npx tsx scripts/check-db.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const content = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const idx = line.indexOf('=')
    if (idx < 1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv()

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  // Deals
  const { data: deals, count: dealCount } = await svc
    .from('deals')
    .select('id,customer_name,service_id,menu_id,channel,status,reward_snapshot', { count: 'exact' })
  console.log(`\n=== DEALS (${dealCount} rows) ===`)
  deals?.forEach(d => console.log(JSON.stringify(d)))

  // Partners
  const { data: partners, count: partnerCount } = await svc
    .from('partners')
    .select('id,code,profile_id,status', { count: 'exact' })
  console.log(`\n=== PARTNERS (${partnerCount} rows) ===`)
  partners?.forEach(p => console.log(JSON.stringify(p)))

  // referral_links
  const { data: links } = await svc.from('referral_links').select('*').limit(5)
  console.log('\n=== REFERRAL_LINKS (sample) ===')
  if (links?.[0]) console.log(JSON.stringify(links[0], null, 2))

  // payouts
  const { data: payouts, count: payoutCount } = await svc
    .from('payouts')
    .select('id,partner_id,fixed_month,gross_amount,net_amount', { count: 'exact' })
  console.log(`\n=== PAYOUTS (${payoutCount} rows) ===`)
  payouts?.forEach(p => console.log(JSON.stringify(p)))
}
main().catch(console.error)
