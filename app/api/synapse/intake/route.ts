import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE Phase 0（P0-2）：AIヒアリングintake。会話から“連絡先レコード候補”を構造化抽出して返すだけ。
// ★保存しない（保存は本人が確認・編集後に /api/synapse/contacts で実行＝人が最終フィルタ）。
// ★Feature C と同じ基盤：partner-auth必須・ai_usageで1日上限・ANTHROPIC_API_KEY未設定なら{disabled:true}。
// ★お金・/r帰属・既存通知トリガには一切触れない。web系SDKは使わず Anthropic REST。Node ランタイム。
export const runtime = 'nodejs'

const DAILY_LIMIT = 20
// 品質優先で Sonnet。コストを見て 'claude-haiku-4-5-20251001' に差し替え可（この1行のみ）。
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 700

const SYSTEM_PROMPT = [
  'あなたは日本のビジネスパーソンの“私的な秘書”です。パートナーが「最近会った人・知り合い」について話す内容を聞き取り、',
  '連絡先レコードの候補を1件、JSONだけで構造化して出力します。',
  '出力は次のJSONオブジェクトのみ（前置き・解説・コードフェンス無し）：',
  '{"name": string|null, "company": string|null, "industry": string|null, "role": string|null, "relationship": string|null, "needs": string[], "notes": string|null}',
  '・分からない項目は null（needs は不明なら空配列）。会話に無い情報を創作しないこと。',
  '・industry=業種、role=その人の役割/役職、relationship=パートナーとの関係性、needs=その人の困りごと/求めていること（短い日本語の箇条）。',
  '・notes は補足メモ（任意）。個人の機微情報は最小限に。',
].join('\n')

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

export async function GET() {
  const partnerId = await resolvePartnerId()
  if (!partnerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ enabled: !!process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ disabled: true })   // graceful degrade

    const b = await req.json().catch(() => ({}))
    const transcript = typeof b.transcript === 'string' ? b.transcript.trim().slice(0, 4000) : ''
    if (!transcript) return NextResponse.json({ error: '聞き取り内容を入力してください' }, { status: 400 })

    // レート上限（Feature C と同じ ai_usage を共用・隔離テーブル）。
    const admin = await createServiceRoleClient()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const { data: usage } = await admin.from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) {
      return NextResponse.json({ error: `本日のAI利用上限（${DAILY_LIMIT}回/日）に達しました。明日また自動的にご利用いただけます。` }, { status: 429 })
    }

    const userMsg = `次の聞き取り内容から、連絡先レコード候補を1件、指定のJSONだけで出力してください。\n\n----\n${transcript}\n----`
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMsg }] }),
    })
    if (!resp.ok) return NextResponse.json({ error: '抽出に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
    const json: any = await resp.json()
    const text = (Array.isArray(json?.content) ? json.content : []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n').trim()

    // JSON 抽出（コードフェンスや前後テキストが混ざっても拾う）。
    let parsed: any = null
    try {
      const m = text.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : null
    } catch { parsed = null }
    if (!parsed || typeof parsed !== 'object') return NextResponse.json({ error: 'うまく聞き取れませんでした。もう少し具体的にお話しください。' }, { status: 422 })

    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null)
    const needsArr = Array.isArray(parsed.needs) ? parsed.needs.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, 8) : []
    const contact = {
      name: str(parsed.name),
      company: str(parsed.company),
      industry: str(parsed.industry),
      role: str(parsed.role),
      relationship: str(parsed.relationship),
      needs: needsArr.join('、') || null,   // text 列に格納するため結合（保存前に本人が編集可）
      notes: str(parsed.notes),
    }

    // 成功時のみ count++。
    await admin.from('ai_usage').upsert({ partner_id: partnerId, day, count: used + 1 }, { onConflict: 'partner_id,day' })

    // 抽出結果を“候補”として返す（保存はしない）。
    return NextResponse.json({ contact })
  } catch {
    return NextResponse.json({ error: '抽出に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
