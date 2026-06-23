// 単体テスト（決定性担保）：computeNudges 3トリガ（発火/非発火・理由・0件→空・上限・新着の誤発火防止）。
// 実行：npx tsx lib/synapse-nudge.test.ts
import { computeNudges, nudgeForContact, type NudgeContact } from './synapse-nudge.ts'

let pass = 0, fail = 0
const ok = (n: string, c: boolean, got?: unknown) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}  got=${JSON.stringify(got)}`) } }

const NOW = Date.parse('2026-06-24T00:00:00Z')
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const C = (id: string, o: Partial<NudgeContact>): NudgeContact => ({ id, name: null, company: null, entity_type: null, url: null, updated_at: ago(1), demand_summary: null, demand_tags: null, recommended_services: null, ...o })

console.log('=== 休眠(dormant) ===')
{
  const old = C('a', { company: 'A社', demand_summary: '需要あり', updated_at: ago(120) })
  const fresh = C('b', { company: 'B社', demand_summary: '需要あり', updated_at: ago(10) })
  const ns = computeNudges([old, fresh], { nowMs: NOW })
  ok('120日前の分析済み→休眠発火', ns.some(n => n.kind === 'dormant' && n.contactId === 'a'), ns)
  ok('10日前→休眠しない', !ns.some(n => n.contactId === 'b'), ns)
  ok('理由に日数', ns[0]?.reason.includes('日動いていません'), ns[0]?.reason)
}
{
  // 未分析のまま古い → 休眠は出さない（高確度のみ・再アプローチの軸が無い）
  const oldEmpty = C('x', { company: 'X', updated_at: ago(200) })
  ok('未分析で古い→休眠出さない', computeNudges([oldEmpty], { nowMs: NOW }).length === 0)
}

console.log('=== 未読み(unread) ===')
{
  const u = C('u', { company: 'U社', url: 'https://u.co.jp', demand_summary: null, demand_tags: null, updated_at: ago(2) })
  const ns = computeNudges([u], { nowMs: NOW })
  ok('URLあり未分析→未読み発火', ns.some(n => n.kind === 'unread' && n.action === 'scan'), ns)
  ok('理由=読み解いていません', ns[0]?.reason.includes('読み解いていません'), ns[0]?.reason)
  // URLあり＋分析済み → 未読みは出ない（むしろ休眠評価へ）
  const analyzed = C('v', { company: 'V', url: 'https://v.co.jp', demand_summary: '済', updated_at: ago(5) })
  ok('URLあり分析済み→未読み出ない', !computeNudges([analyzed], { nowMs: NOW }).some(n => n.kind === 'unread'))
}

console.log('=== 新着(newservice)・誤発火防止 ===')
{
  const c = C('n', { company: 'N社', demand_summary: '済', demand_tags: ['採用強化'], recommended_services: ['採用支援'], updated_at: ago(3) })
  // newServiceNames 空（services に created_at 無い本番想定）→ 新着は出ない
  ok('新着情報なし→新着出ない(誤発火防止)', !computeNudges([c], { nowMs: NOW }).some(n => n.kind === 'newservice'))
  // 明示的に新サービスを渡し、需要に一致 → 発火
  const ns = computeNudges([c], { nowMs: NOW, newServiceNames: ['採用支援'] })
  ok('新サービスが需要一致→新着発火', ns.some(n => n.kind === 'newservice' && n.serviceName === '採用支援'), ns)
  ok('新着理由にサービス名', ns[0]?.reason.includes('採用支援'), ns[0]?.reason)
  // 一致しない新サービス → 出ない
  ok('新サービス不一致→出ない', !computeNudges([c], { nowMs: NOW, newServiceNames: ['宇宙開発'] }).some(n => n.kind === 'newservice'))
}

console.log('=== 0件→空・上限・決定性 ===')
{
  ok('該当なし→空', computeNudges([C('z', { updated_at: ago(1) })], { nowMs: NOW }).length === 0)
  const many = Array.from({ length: 6 }, (_, i) => C('d' + i, { company: 'D' + i, demand_summary: '済', updated_at: ago(100 + i) }))
  ok('上限3', computeNudges(many, { nowMs: NOW, max: 3 }).length === 3, computeNudges(many, { nowMs: NOW, max: 3 }).length)
  const r1 = JSON.stringify(computeNudges(many, { nowMs: NOW }))
  const r2 = JSON.stringify(computeNudges(many, { nowMs: NOW }))
  ok('決定的（同一出力）', r1 === r2)
}

console.log('=== nudgeForContact ===')
{
  ok('単一・該当あり', !!nudgeForContact(C('s', { company: 'S', demand_summary: '済', updated_at: ago(150) }), { nowMs: NOW }))
  ok('単一・該当なし→null', nudgeForContact(C('s', { updated_at: ago(1) }), { nowMs: NOW }) === null)
}

console.log(`\n=== RESULT: ${pass} pass / ${fail} fail ===`)
if (fail > 0) process.exit(1)
