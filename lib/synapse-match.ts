// SYNAPSE マッチング・エンジン（決定的・AI非依存・ローカル検証可）。
// 本人の synapse_contacts のみ参照（MB非横断）＋サービス目録は read-only。書込ゼロ。
// 高確度のみ発火（重なりゼロなら沈黙）。各候補に「理由」（重なったキーワード）を必ず付す。

import { synNorm } from './synapse-entity'

export type MatchContact = {
  id: string
  name: string | null
  company: string | null
  industry: string | null
  entity_type: string | null
  demand_tags: string[] | null
  recommended_services: string[] | null
}

export type MatchCandidate = {
  kind: 'contact' | 'service'
  refId: string | null          // kind=contact のとき相手の contact id（kind=service は null）
  title: string                 // 人(会社/氏名) or サービス名
  entity?: 'individual' | 'corporate'
  reasons: string[]             // 重なった元キーワード（表示用）
  reason: string                // 理由の一文
  score: number
}

const MIN_TOKEN = 2
const corpOf = (c: MatchContact) => c.entity_type === 'individual' ? false : c.entity_type === 'corporate' ? true : !!c.company
const titleOf = (c: MatchContact) => (corpOf(c) ? (c.company || c.name) : (c.name || c.company)) || '名称未設定'

// 正規化トークン → 元表記 の map（重複は最初の表記を保持）。
function tokenMap(values: Array<string | null | undefined>): Map<string, string> {
  const m = new Map<string, string>()
  for (const v of values) {
    if (!v) continue
    const n = synNorm(v)
    if (n.length >= MIN_TOKEN && !m.has(n)) m.set(n, v)
  }
  return m
}

// あるつながり focus に対する「つなげる候補」を決定的に算出。最大 max 件・閾値未満は出さない（沈黙）。
export function matchForContact(focus: MatchContact, all: MatchContact[], catalog: string[], max = 3): MatchCandidate[] {
  const xMap = tokenMap([...(focus.demand_tags ?? []), ...(focus.recommended_services ?? []), focus.industry])
  if (xMap.size === 0) return []   // 需要キーワードが無ければ黙る
  const xTok = new Set(xMap.keys())
  const cands: MatchCandidate[] = []

  // 人候補：台帳内の他のつながりで、需要キーワード/業種/サービス適性が重なるもの。
  for (const y of all) {
    if (y.id === focus.id) continue
    const yTokMap = tokenMap([...(y.demand_tags ?? []), ...(y.recommended_services ?? []), y.industry])
    const overlap = [...xTok].filter(t => yTokMap.has(t))
    if (overlap.length === 0) continue   // 重なりゼロは候補化しない
    const reasons = overlap.map(t => xMap.get(t)!).slice(0, 3)
    cands.push({ kind: 'contact', refId: y.id, title: titleOf(y), entity: corpOf(y) ? 'corporate' : 'individual', reasons, reason: `共通の関心：${reasons.join('・')}`, score: overlap.length })
  }

  // サービス候補：MB目録（read-only）のうち X の需要キーワード/推奨に一致するもの。推奨に含まれれば高確度。
  const recoSet = new Set((focus.recommended_services ?? []).map(synNorm))
  const svcSeen = new Set<string>()
  for (const svc of catalog) {
    const n = synNorm(svc)
    if (!xTok.has(n) || svcSeen.has(n)) continue
    svcSeen.add(n)
    const boosted = recoSet.has(n)
    cands.push({ kind: 'service', refId: null, title: svc, reasons: [xMap.get(n)!], reason: boosted ? '需要に直結する推奨サービス' : `需要キーワード：${xMap.get(n)}`, score: boosted ? 3 : 1 })
  }

  // 決定的ソート：スコア降順→人を先→タイトル昇順。上限 max。
  cands.sort((a, b) => b.score - a.score || (a.kind === b.kind ? 0 : a.kind === 'contact' ? -1 : 1) || a.title.localeCompare(b.title))
  return cands.slice(0, max)
}

export type TopSuggestion = { focusId: string; focusTitle: string; candidate: MatchCandidate; score: number } | null

// HOME「今日の示唆」：本人台帳全体から最高スコアの1件を決定的に選ぶ（無ければ null＝中立文へ）。
export function topSuggestion(contacts: MatchContact[], catalog: string[]): TopSuggestion {
  let best: TopSuggestion = null
  for (const f of contacts) {
    const cs = matchForContact(f, contacts, catalog, 1)
    if (!cs.length) continue
    const c = cs[0]
    if (!best || c.score > best.score) best = { focusId: f.id, focusTitle: titleOf(f), candidate: c, score: c.score }
  }
  return best
}
