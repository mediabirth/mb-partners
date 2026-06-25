/**
 * リッチ Phase1：LINE Flex Message（bubble）構築ヘルパー（additive・隔離）。
 * ★buttons がある時だけ使う。buttons 無しの送信は既存の text/image 経路を使う（byte-unchanged）。
 * money/発火には一切触れない。純粋にペイロード組み立て。
 */
export type FlexButton = { label: string; url: string }

/**
 * hero=画像（任意）/ body=本文（任意）/ footer=URLボタン（最大3）の bubble を1枚作る。
 * 中身が空（全部なし）なら null。altText は本文先頭 or 既定。
 */
export function buildRichFlex(opts: { imageUrl?: string | null; body?: string | null; buttons?: FlexButton[]; altText?: string }): Record<string, unknown> | null {
  const buttons = (opts.buttons ?? []).filter(b => b?.label && /^https?:\/\//i.test(b?.url ?? '')).slice(0, 3)
  const bubble: Record<string, unknown> = { type: 'bubble' }
  if (opts.imageUrl) bubble.hero = { type: 'image', url: opts.imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' }
  if (opts.body) bubble.body = { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: opts.body, wrap: true, size: 'sm', color: '#0A0A0A' }] }
  if (buttons.length) bubble.footer = {
    type: 'box', layout: 'vertical', spacing: 'sm',
    contents: buttons.map(b => ({ type: 'button', style: 'primary', color: '#4733E6', height: 'sm', action: { type: 'uri', label: b.label.slice(0, 40), uri: b.url } })),
  }
  if (!bubble.hero && !bubble.body && !bubble.footer) return null
  const altText = (opts.altText || opts.body || 'メッセージが届きました').slice(0, 380)
  return { type: 'flex', altText, contents: bubble }
}
