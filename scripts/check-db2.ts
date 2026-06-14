import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
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

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const { data: pi } = await svc.from('payout_items').select('id,partner_id,deal_id,gross_amount,net_amount,tax_amount,fixed_month')
  console.log('=== PAYOUT_ITEMS ===')
  pi?.forEach(r => console.log(JSON.stringify(r)))

  const { data: pb } = await svc.from('payout_batches').select('*')
  console.log('\n=== PAYOUT_BATCHES ===')
  pb?.forEach(r => console.log(JSON.stringify(r)))

  const { data: al } = await svc.from('audit_logs').select('id,action,entity_type,entity_id,note').limit(30)
  console.log('\n=== AUDIT_LOGS ===')
  al?.forEach(r => console.log(JSON.stringify(r)))

  const { data: rl } = await svc.from('referral_links').select('*')
  console.log('\n=== ALL REFERRAL_LINKS ===')
  rl?.forEach(r => console.log(JSON.stringify(r)))

  // Profiles to identify test partners
  const { data: prof } = await svc.from('profiles').select('id,name,email,role')
  console.log('\n=== PROFILES ===')
  prof?.forEach(r => console.log(JSON.stringify(r)))
}
main().catch(console.error)
