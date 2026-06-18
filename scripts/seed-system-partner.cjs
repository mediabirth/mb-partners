/**
 * 直営業基盤：MB直営（is_system）システムパートナーを冪等に作成する。
 * profiles.id は auth.users への FK のため、admin API で auth user → profile → partner を順に作る。
 * 支払対象外（close_month は is_system 除外）・全パートナーUI/集計から非表示・status='suspended'。
 * 実行: node scripts/seed-system-partner.cjs（partners.is_system 列の追加後に実行）。冪等。
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const EMAIL = 'mb-house@mb-system.internal'
const NAME = 'MB直営'
const CODE = 'MBHOUSE'

;(async () => {
  // 0) 既に is_system パートナーがあれば何もしない（冪等）。
  const existing = await svc.from('partners').select('id, code').eq('is_system', true).maybeSingle()
  if (existing.error) { console.error('is_system 列が無い可能性。Run① のSQL適用後に実行してください:', existing.error.message); process.exit(1) }
  if (existing.data) { console.log('既存 MB直営:', existing.data.id, existing.data.code, '→ skip'); return }

  // 1) auth user（既存メールがあれば再利用）。listUsers が不調な環境のため generateLink で id を取得。
  let uid
  const cre = await svc.auth.admin.createUser({ email: EMAIL, email_confirm: true })
  if (cre.error) {
    // 既に登録済み → generateLink で既存 user id を引く。
    const link = await svc.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
    if (link.error || !link.data?.user?.id) { console.error('既存 user 取得 ERR', link.error?.message); process.exit(1) }
    uid = link.data.user.id
    console.log('auth user 既存:', uid)
  } else {
    uid = cre.data.user.id
    console.log('auth user 作成:', uid)
  }

  // 2) profile（role=partner なので director候補等からは自動除外）。
  const prof = await svc.from('profiles').upsert({ id: uid, role: 'partner', name: NAME, email: EMAIL, color: '#6E707D' }).select('id').single()
  if (prof.error) { console.error('profile upsert ERR', prof.error.message); process.exit(1) }
  console.log('profile 準備:', uid)

  // 3) partner（is_system=true・status=suspended＝active系クエリ/集計から除外）。
  const ins = await svc.from('partners').insert({
    profile_id: uid, code: CODE, tax_type: 'corporate', status: 'suspended',
    is_system: true, is_frontier: false,
  }).select('id').single()
  if (ins.error) { console.error('partner insert ERR', ins.error.message); process.exit(1) }
  console.log('MB直営 partner 作成:', ins.data.id)
  console.log('DONE')
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
