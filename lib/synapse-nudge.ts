// SYNAPSE ナッジ・エンジン（決定的・AI非依存・ローカル検証可）。
// 本人 synapse_contacts のみ参照（＋目録 read-only）。書込ゼロ。高確度のみ発火・各ナッジに「なぜ今」理由必須・件数を絞る。
// 「能動だが受信に映る」：煽らず・出しすぎず・沈黙はノイズに勝る。

import { synNorm } from './synapse-entity'

export type NudgeContact = {
  id: string
  name: string | null
  company: string | null
  entity_type: string | null
  url: string | null
  updated_at: string
  demand_summary: string | null
  demand_tags: string[] | null
  recommended_services: string[] | null
}

export type Nudge = {
  kind: 'dormant' | 'newservice' | 'unread'
  contactId: string
  title: string
  reason: string                 // なぜ今（理由）
  action: 'refer' | 'scan'       // 休眠/新着→refer(プリフィル)／未読み→scan(詳細[SYNAPSE])
  serviceName?: string
  score: number
}

const DAY = 86_400_000
const empty = (v: unknown) => !(typeof v === 'string' && v.trim())
const hasTags = (a: string[] | null | undefined) => Array.isArray(a) && a.length > 0
const analyzed = (c: NudgeContact) => !empty(c.demand_summary) || hasTags(c.demand_tags) || hasTags(c.recommended_services)
const corpOf = (c: NudgeContact) => c.entity_type === 'individual' ? false : c.entity_type === 'corporate' ? true : !!c.company
const titleOf = (c: NudgeContact) => (corpOf(c) ? (c.company || c.name) : (c.name || c.company)) || '名称未設定'

export type NudgeOpts = { nowMs: number; dormantDays?: number; newServiceNames?: string[]; max?: number }

// 決定的：各つながりに最大1ナッジ（最優先のみ）→スコア降順→上限。閾値未満は出さない（沈黙）。
export function computeNudges(contacts: NudgeContact[], opts: NudgeOpts): Nudge[] {
  const { nowMs, dormantDays = 90, newServiceNames = [], max = 3 } = opts
  // 新着＝目録に「新しい」確証がある時だけ（services に created_at が無い環境では空＝誤発火しない）。
  const newSvcTokens = new Map<string, string>()
  for (const s of newServiceNames) { const n = synNorm(s); if (n.length >= 2 && !newSvcTokens.has(n)) newSvcTokens.set(n, s) }

  const out: Nudge[] = []
  for (const c of contacts) {
    const title = titleOf(c)
    // ② 新着（最優先）：分析済みのつながりの需要と、新サービスが一致するか。
    if (newSvcTokens.size > 0 && analyzed(c)) {
      const cTokens = new Set([...(c.demand_tags ?? []), ...(c.recommended_services ?? [])].map(synNorm).filter(n => n.length >= 2))
      let hit: string | null = null
      for (const [tok, raw] of newSvcTokens) if (cTokens.has(tok)) { hit = raw; break }
      if (hit) { out.push({ kind: 'newservice', contactId: c.id, title, serviceName: hit, action: 'refer', reason: `新しい「${hit}」が、${title}の需要に合いそうです。`, score: 100 }); continue }
    }
    // ③ 未読み：URLはあるが未分析（demand未生成）。
    if (!empty(c.url) && empty(c.demand_summary) && !hasTags(c.demand_tags)) {
      out.push({ kind: 'unread', contactId: c.id, title, action: 'scan', reason: `${title} はまだ読み解いていません。会社URLから需要を読めます。`, score: 50 }); continue
    }
    // ① 休眠：分析済みなのに一定期間動いていない（再アプローチの好機）。
    if (analyzed(c)) {
      const ageDays = Math.floor((nowMs - Date.parse(c.updated_at)) / DAY)
      if (Number.isFinite(ageDays) && ageDays >= dormantDays) {
        out.push({ kind: 'dormant', contactId: c.id, title, action: 'refer', reason: `${title} は約${ageDays}日動いていません。再アプローチの好機です。`, score: 10 + Math.min(ageDays, 365) / 100 })
      }
    }
  }
  // スコア降順→contactId昇順（決定的）→上限。
  out.sort((a, b) => b.score - a.score || a.contactId.localeCompare(b.contactId))
  return out.slice(0, max)
}

// 単一つながり向け（詳細の一言ナッジ）。最優先1件 or null。
export function nudgeForContact(c: NudgeContact, opts: NudgeOpts): Nudge | null {
  return computeNudges([c], { ...opts, max: 1 })[0] ?? null
}
