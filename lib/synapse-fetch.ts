// SYNAPSE scan の純粋ヘルパ（ネットワーク非依存）。route.ts と単体テストで同一コードを共有＝決定性を担保。
// SSRF対策(safeUrl)・本文抽出(extractText)・住所抽出(extractAddress)・住所ページ優先リンク抽出(extractAddressLinks)。

// 基本SSRF対策：http/https のみ、内部/予約アドレスを遮断。
export function safeUrl(raw: string): URL | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null
  if (host.includes(':')) return null // 生IPv6リテラル（::1/fc00 等）を遮断
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    const p = host.split('.').map(Number)
    if (p.some(n => n > 255)) return null
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return null
    if (p[0] === 169 && p[1] === 254) return null // link-local＋メタデータ
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return null
    if (p[0] === 192 && p[1] === 168) return null
    if (p[0] >= 224) return null
  }
  return u
}

export function extractText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

// 日本の住所を“決定的に”抽出（AI非依存）。郵便番号アンカー優先→都道府県起点フォールバック。先頭1件のみ・多拠点の過剰捕捉を抑制。
export const PREF = '北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県'
export function extractAddress(text: string): string | null {
  // 最初の妥当一致を1件だけ返す。後続拠点(本社/支店/2件目の〒)や TEL/FAX/区切りで打ち切り＝多拠点の過剰捕捉を抑制。
  const clean = (s: string) => s
    .replace(/\s+/g, ' ').trim()
    .split(/\s*(?:TEL|Tel|tel|電話|FAX|Fax|fax|MAP|地図|アクセス|営業時間|定休日|本社所在地|本部所在地|本店所在地|本社|本部|支店|営業所|支社|〒|[／\/｜|])/)[0]
    .trim().slice(0, 60)
  // 郵便番号（〒123-4567）の直後に続く都道府県起点の住所を優先（先頭の1件）。
  const zip = text.match(new RegExp(`〒?\\s?\\d{3}[-－‐]\\d{4}\\s*((?:${PREF})[^。｜|<>　]{4,50})`))
  if (zip && zip[1]) { const v = clean(zip[1]); if (v.length >= 5) return v }
  // フォールバック：都道府県起点パターンの「最初の」一致（最長ではなく先頭＝多拠点で1件目）。
  const m = text.match(new RegExp(`(?:${PREF})[^。｜|<>　\\n]{4,50}`))
  if (m && m[0]) { const v = clean(m[0]); if (v.length >= 5) return v }
  return null
}

// 住所が載りやすいページを「高優先」、その他関連ページを「低優先」とスコア付けし、スコア降順で最大2件選ぶ。
const ADDR_HINT_HI = /(会社概要|会社案内|会社情報|企業情報|法人概要|特定商取引|特商法|アクセス|所在地|tokusho|sctl|tokushoho|company|corporate|profile|access|location)/i
const ADDR_HINT_LO = /(about|プロフィール|概要|案内|会社|企業|法人|law|contact|お問い合わせ|outline|info)/i
export function extractAddressLinks(html: string, base: URL): URL[] {
  const seen = new Set<string>([base.origin + base.pathname])
  const cands: Array<{ url: URL; score: number; i: number }> = []
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi
  let m: RegExpExecArray | null
  let idx = 0
  while ((m = re.exec(html))) {
    const href = m[1]; const inner = m[2].replace(/<[^>]+>/g, '')
    const hay = `${href} ${inner}`
    const score = ADDR_HINT_HI.test(hay) ? 2 : ADDR_HINT_LO.test(hay) ? 1 : 0
    if (score === 0) continue
    let abs: URL; try { abs = new URL(href, base) } catch { continue }
    const safe = safeUrl(abs.toString()); if (!safe) continue                       // ★SSRFガード再適用
    if (safe.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue        // 同一ドメインのみ
    const key = safe.origin + safe.pathname
    if (seen.has(key)) continue
    seen.add(key); cands.push({ url: safe, score, i: idx++ })
  }
  // スコア降順（同点は出現順）で最大2件。
  return cands.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 2).map(c => c.url)
}
