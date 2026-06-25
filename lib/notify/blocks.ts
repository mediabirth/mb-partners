/**
 * リッチ再設計：エルメ型ブロック配列（additive・隔離）。
 * Block = text / image(任意でタップURL) / button。順序保持。
 * ★blocks 未設定（null/空）の旧テンプレは呼び出し側で従来の body/attachments/buttons 経路を使う（byte-unchanged）。
 *   本モジュールは blocks が「明示的に設定された」テンプレの送信時のみ使用。
 * money/発火には一切触れない。純粋に解釈・組み立て。
 */
export type TextBlock = { type: 'text'; text: string }
export type ImageBlock = { type: 'image'; path: string; url?: string }
export type ButtonBlock = { type: 'button'; label: string; url: string }
export type CarouselCard = { image?: string; title?: string; text?: string; tapUrl?: string; buttons?: { label: string; url: string }[] }
export type CarouselBlock = { type: 'carousel'; cards: CarouselCard[] }
export type Block = TextBlock | ImageBlock | ButtonBlock | CarouselBlock

const isUrl = (u?: string) => !!u && /^https?:\/\//i.test(u)

function parseCard(c: Record<string, unknown>): CarouselCard {
  const card: CarouselCard = {}
  if (typeof c.image === 'string' && c.image) card.image = c.image
  if (typeof c.title === 'string' && c.title.trim()) card.title = c.title.slice(0, 200)
  if (typeof c.text === 'string' && c.text.trim()) card.text = c.text.slice(0, 1000)
  if (isUrl(c.tapUrl as string)) card.tapUrl = c.tapUrl as string
  const btns = Array.isArray(c.buttons) ? (c.buttons as Array<Record<string, unknown>>)
    .filter(b => typeof b.label === 'string' && (b.label as string).trim() && isUrl(b.url as string))
    .map(b => ({ label: (b.label as string).slice(0, 40), url: b.url as string })).slice(0, 2) : []
  if (btns.length) card.buttons = btns
  return card
}
const cardHasContent = (c: CarouselCard) => !!(c.image || c.title || c.text || (c.buttons && c.buttons.length))

/** 生 jsonb を検証して Block[] に。未知/欠損は除外。 */
export function parseBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return []
  const out: Block[] = []
  for (const b of raw as Array<Record<string, unknown>>) {
    if (b?.type === 'text' && typeof b.text === 'string') out.push({ type: 'text', text: b.text })
    else if (b?.type === 'image' && typeof b.path === 'string') out.push({ type: 'image', path: b.path, url: isUrl(b.url as string) ? (b.url as string) : undefined })
    else if (b?.type === 'button' && typeof b.label === 'string' && isUrl(b.url as string)) out.push({ type: 'button', label: (b.label as string).slice(0, 40), url: b.url as string })
    else if (b?.type === 'carousel' && Array.isArray(b.cards)) {
      const cards = (b.cards as Array<Record<string, unknown>>).map(parseCard).filter(cardHasContent).slice(0, 10)
      if (cards.length) out.push({ type: 'carousel', cards })
    }
  }
  return out.slice(0, 20)
}

/** 後方互換：旧 body/attachments/buttons → ブロック列（固定順 text→image→button）。編集UI表示・移行用。 */
export function blocksFromLegacy(p: { body?: string | null; attachments?: { type?: string; path?: string }[] | null; buttons?: { label?: string; url?: string }[] | null }): Block[] {
  const out: Block[] = []
  if (p.body && p.body.trim()) out.push({ type: 'text', text: p.body })
  for (const a of p.attachments ?? []) if (a?.type === 'image' && a?.path) out.push({ type: 'image', path: a.path })
  for (const b of p.buttons ?? []) if (b?.label && isUrl(b?.url)) out.push({ type: 'button', label: b.label, url: b.url as string })
  return out
}

/** ${key} 展開（text と image.url / button.url / carousel カード各種）。 */
export function fillBlocks(blocks: Block[], vars: Record<string, string | number | null | undefined>): Block[] {
  const fill = (s: string) => s.replace(/\$\{(\w+)\}/g, (whole, k: string) => { const v = vars[k]; return v === undefined || v === null ? whole : String(v) })
  return blocks.map(b => b.type === 'text' ? { ...b, text: fill(b.text) }
    : b.type === 'image' ? { ...b, url: b.url ? fill(b.url) : undefined }
    : b.type === 'button' ? { ...b, url: fill(b.url), label: fill(b.label) }
    : { ...b, cards: b.cards.map(c => ({ ...c, title: c.title ? fill(c.title) : undefined, text: c.text ? fill(c.text) : undefined, tapUrl: c.tapUrl ? fill(c.tapUrl) : undefined, buttons: c.buttons?.map(bt => ({ label: fill(bt.label), url: fill(bt.url) })) })) })
}

/** 旧フィールド派生（blocks を正にしつつ、body/attachments/buttons 互換も保つ）。carousel はカード画像/ボタンを flatten。 */
export function legacyFromBlocks(blocks: Block[]): { body: string | null; attachments: { type: 'image'; path: string }[]; buttons: { label: string; url: string }[] } {
  const texts = blocks.filter((b): b is TextBlock => b.type === 'text').map(b => b.text)
  const images: { type: 'image'; path: string }[] = []
  const buttons: { label: string; url: string }[] = []
  for (const b of blocks) {
    if (b.type === 'image') images.push({ type: 'image', path: b.path })
    else if (b.type === 'button') buttons.push({ label: b.label, url: b.url })
    else if (b.type === 'carousel') for (const c of b.cards) { if (c.image) images.push({ type: 'image', path: c.image }); for (const bt of c.buttons ?? []) buttons.push(bt) }
  }
  return { body: texts.length ? texts.join('\n\n') : null, attachments: images, buttons }
}

/**
 * blocks → LINE messages 配列（順序保持）。signFn(path)→署名URL。
 * text→text message／image(url無)→image message／image(url有)→Flex(hero画像にaction uri)／
 * 連続する button→1つの Flex bubble の footer にまとめる。LINE上限5メッセージで打ち切り（超過は切り捨て）。
 */
export async function blocksToLineMessages(blocks: Block[], signFn: (path: string) => Promise<string | null>): Promise<Array<Record<string, unknown>>> {
  const msgs: Array<Record<string, unknown>> = []
  let i = 0
  while (i < blocks.length && msgs.length < 5) {
    const b = blocks[i]
    if (b.type === 'text') {
      if (b.text.trim()) msgs.push({ type: 'text', text: b.text.slice(0, 5000) })
      i++
    } else if (b.type === 'image') {
      const url = await signFn(b.path)
      if (url) {
        if (b.url) {
          msgs.push({ type: 'flex', altText: '画像', contents: { type: 'bubble', hero: { type: 'image', url, size: 'full', aspectRatio: '20:13', aspectMode: 'cover', action: { type: 'uri', uri: b.url } } } })
        } else {
          msgs.push({ type: 'image', originalContentUrl: url, previewImageUrl: url })
        }
      }
      i++
    } else if (b.type === 'button') {
      // 連続ボタンをまとめる
      const run: ButtonBlock[] = []
      while (i < blocks.length && blocks[i].type === 'button' && run.length < 3) { run.push(blocks[i] as ButtonBlock); i++ }
      msgs.push({
        type: 'flex', altText: run[0]?.label || 'メニュー',
        contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: run.map(r => ({ type: 'button', style: 'primary', color: '#4733E6', height: 'sm', action: { type: 'uri', label: r.label.slice(0, 40), uri: r.url } })) } },
      })
    } else if (b.type === 'carousel') {
      // carousel → Flex carousel（bubble配列・最大10）。各カード hero画像/body(title+text)/footer(button最大2)。
      const bubbles: Array<Record<string, unknown>> = []
      for (const c of b.cards.slice(0, 10)) {
        const bubble: Record<string, unknown> = { type: 'bubble', size: 'kilo' }
        if (c.image) { const u = await signFn(c.image); if (u) bubble.hero = { type: 'image', url: u, size: 'full', aspectRatio: '20:13', aspectMode: 'cover', ...(c.tapUrl ? { action: { type: 'uri', uri: c.tapUrl } } : {}) } }
        const bodyContents: Array<Record<string, unknown>> = []
        if (c.title) bodyContents.push({ type: 'text', text: c.title, weight: 'bold', size: 'sm', wrap: true })
        if (c.text) bodyContents.push({ type: 'text', text: c.text, size: 'xs', color: '#666666', wrap: true })
        if (bodyContents.length) bubble.body = { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents }
        if (c.buttons?.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: c.buttons.slice(0, 2).map(bt => ({ type: 'button', style: 'primary', color: '#4733E6', height: 'sm', action: { type: 'uri', label: bt.label.slice(0, 40), uri: bt.url } })) }
        if (bubble.hero || bubble.body || bubble.footer) bubbles.push(bubble)
      }
      if (bubbles.length) msgs.push({ type: 'flex', altText: (b.cards.find(c => c.title)?.title) || 'カルーセル', contents: { type: 'carousel', contents: bubbles } })
      i++
    } else {
      i++
    }
  }
  return msgs
}

/** blocks → メール本文HTML断片（順序保持）。signFn は省略（メールは img src に署名URL or 公開URL）。 */
export function blocksToEmailInnerHtml(blocks: Block[], imgSrc: (path: string) => string | null): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const parts: string[] = []
  for (const b of blocks) {
    if (b.type === 'text') parts.push(`<p style="margin:0 0 14px;white-space:pre-wrap">${esc(b.text)}</p>`)
    else if (b.type === 'image') { const src = imgSrc(b.path); if (src) { const img = `<img src="${esc(src)}" alt="" style="display:block;max-width:100%;border-radius:10px;margin:0 0 14px" />`; parts.push(b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener">${img}</a>` : img) } }
    else if (b.type === 'button') parts.push(`<div style="margin:0 0 10px"><a href="${esc(b.url)}" style="display:inline-block;background:#4733E6;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:9px">${esc(b.label)}</a></div>`)
    else if (b.type === 'carousel') {
      // メールは横スクロール非対応→カードを縦積み。
      for (const c of b.cards) {
        const inner: string[] = []
        if (c.image) { const src = imgSrc(c.image); if (src) { const img = `<img src="${esc(src)}" alt="" style="display:block;width:100%;border-radius:8px 8px 0 0" />`; inner.push(c.tapUrl ? `<a href="${esc(c.tapUrl)}" target="_blank" rel="noopener">${img}</a>` : img) } }
        const pad: string[] = []
        if (c.title) pad.push(`<div style="font-weight:700;font-size:14px;margin:0 0 4px">${esc(c.title)}</div>`)
        if (c.text) pad.push(`<div style="font-size:13px;color:#555;margin:0 0 8px;white-space:pre-wrap">${esc(c.text)}</div>`)
        for (const bt of c.buttons ?? []) pad.push(`<div style="margin:6px 0 0"><a href="${esc(bt.url)}" style="display:inline-block;background:#4733E6;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 18px;border-radius:8px">${esc(bt.label)}</a></div>`)
        if (pad.length) inner.push(`<div style="padding:12px 14px">${pad.join('')}</div>`)
        if (inner.length) parts.push(`<div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin:0 0 14px;max-width:320px">${inner.join('')}</div>`)
      }
    }
  }
  return parts.join('\n')
}
