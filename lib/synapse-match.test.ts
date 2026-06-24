// 単体テスト（決定性担保）：matchForContact / topSuggestion。
// 実行：node lib/synapse-match.test.ts （Node 25 type-stripping）。
import { matchForContact, topSuggestion, synapseConclusion, type MatchContact, type MatchCandidate } from './synapse-match.ts'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, got?: unknown) => { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}  got=${JSON.stringify(got)}`) } }

const C = (id: string, o: Partial<MatchContact>): MatchContact => ({ id, name: null, company: null, industry: null, entity_type: null, demand_tags: null, recommended_services: null, ...o })

const catalog = ['採用支援', 'Web制作', 'EC構築', 'DX・業務効率化']

console.log('=== matchForContact ===')
// X=採用強化の需要、Y=採用支援が得意（recommended_servicesで重なり）。
{
  const X = C('x', { company: 'X社', demand_tags: ['採用強化', 'ブランド刷新'], recommended_services: ['採用支援'] })
  const Y = C('y', { company: 'Y社', industry: '人材', recommended_services: ['採用支援'] })
  const Z = C('z', { company: 'Z社', demand_tags: ['物流最適化'] })   // 重なり無し→候補化されない
  const cands = matchForContact(X, [X, Y, Z], catalog, 3)
  const contactC = cands.find(c => c.kind === 'contact')
  ok('重なるYを人候補に', !!contactC && contactC.refId === 'y', cands)
  ok('Zは候補に出ない（重なり0）', !cands.some(c => c.refId === 'z'), cands)
  ok('理由に重なりキーワード', !!contactC && contactC.reason.includes('採用支援'), contactC?.reason)
  ok('サービス候補=採用支援(推奨で高確度)', cands.some(c => c.kind === 'service' && c.title === '採用支援' && c.score === 3), cands)
}
// 閾値：需要キーワードが無い focus → 空（沈黙）。
{
  const X = C('x', { company: '無需要社' })
  ok('需要なし→空', matchForContact(X, [X, C('y', { demand_tags: ['採用強化'] })], catalog).length === 0)
}
// 0件：誰とも重ならない → 空。
{
  const X = C('x', { demand_tags: ['宇宙開発'] })
  ok('重なり皆無→空', matchForContact(X, [X, C('y', { demand_tags: ['農業'] })], catalog).length === 0)
}
// 上限3：多数重なっても最大3件。
{
  const X = C('x', { demand_tags: ['採用強化'] })
  const many = [X, ...Array.from({ length: 6 }, (_, i) => C('y' + i, { company: 'Y' + i, demand_tags: ['採用強化'] }))]
  ok('上限3', matchForContact(X, many, catalog, 3).length === 3, matchForContact(X, many, catalog, 3).length)
}
// 決定性：同入力→同出力（順序含む）。
{
  const X = C('x', { demand_tags: ['採用強化'] })
  const all = [X, C('b', { company: 'B', demand_tags: ['採用強化'] }), C('a', { company: 'A', demand_tags: ['採用強化'] })]
  const r1 = JSON.stringify(matchForContact(X, all, catalog, 3))
  const r2 = JSON.stringify(matchForContact(X, all, catalog, 3))
  ok('決定的（同一出力）', r1 === r2)
}

console.log('=== topSuggestion ===')
{
  const a = C('a', { company: 'A社', demand_tags: ['採用強化'], recommended_services: ['採用支援'] })
  const b = C('b', { company: 'B社', industry: '人材', recommended_services: ['採用支援'] })
  const s = topSuggestion([a, b], catalog)
  ok('示唆あり（最高スコア1件）', !!s && !!s.candidate, s)
  ok('示唆に理由', !!s && s.candidate.reason.length > 0, s?.candidate.reason)
  ok('示唆なし→null', topSuggestion([C('z', { demand_tags: ['宇宙'] })], catalog) === null)
}

console.log('=== synapseConclusion（決定的・AI非依存） ===')
{
  const svc: MatchCandidate = { kind: 'service', refId: null, title: 'MatchHub', reasons: ['採用強化'], reason: '', score: 3 }
  const ppl: MatchCandidate = { kind: 'contact', refId: 'y', title: 'エヌ・アパレル', entity: 'corporate', reasons: ['採用強化'], reason: '', score: 1 }
  const cs = synapseConclusion(['グローバル採用強化'], [svc])
  ok('サービス→紹介(verb)', !!cs && cs.verb === '紹介' && cs.targetTitle === 'MatchHub' && cs.keyword === 'グローバル採用強化', cs)
  const cc = synapseConclusion(['グローバル採用強化'], [ppl])
  ok('人→つなげる(verb)', !!cc && cc.verb === 'つなげる' && cc.targetTitle === 'エヌ・アパレル', cc)
  ok('キーワード無→null', synapseConclusion([], [svc]) === null)
  ok('候補無→null', synapseConclusion(['採用'], []) === null)
  ok('両方無→null', synapseConclusion(null, null) === null)
}

console.log(`\n=== RESULT: ${pass} pass / ${fail} fail ===`)
if (fail > 0) process.exit(1)
