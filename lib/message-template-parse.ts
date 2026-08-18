// メッセージテンプレートRoute間の共通入力整形。Routeファイルから任意関数をexportしないため分離する。
export function parseButtons(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((b: { label?: string; url?: string }) => ({ label: (b?.label ?? '').trim().slice(0, 40), url: (b?.url ?? '').trim().slice(0, 1000) }))
    .filter(b => b.label && /^https?:\/\//i.test(b.url)).slice(0, 3)
}

export function parseTplBlocks(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  const out: Record<string, unknown>[] = []
  for (const b of raw as Array<Record<string, unknown>>) {
    if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push({ type: 'text', text: b.text.slice(0, 5000) })
    else if (b?.type === 'image' && typeof b.path === 'string') out.push({ type: 'image', path: b.path, ...(typeof b.url === 'string' && /^https?:\/\//i.test(b.url) ? { url: b.url.slice(0, 1000) } : {}) })
    else if (b?.type === 'button' && typeof b.label === 'string' && typeof b.url === 'string' && /^https?:\/\//i.test(b.url) && b.label.trim()) out.push({ type: 'button', label: b.label.trim().slice(0, 40), url: b.url.slice(0, 1000) })
    else if (b?.type === 'carousel' && Array.isArray(b.cards)) {
      const cards = (b.cards as Array<Record<string, unknown>>).map(c => {
        const card: Record<string, unknown> = {}
        if (typeof c.image === 'string' && c.image) card.image = c.image
        if (typeof c.title === 'string' && c.title.trim()) card.title = c.title.slice(0, 200)
        if (typeof c.text === 'string' && c.text.trim()) card.text = c.text.slice(0, 1000)
        if (typeof c.tapUrl === 'string' && /^https?:\/\//i.test(c.tapUrl)) card.tapUrl = c.tapUrl.slice(0, 1000)
        const btns = Array.isArray(c.buttons) ? (c.buttons as Array<Record<string, unknown>>).filter(x => typeof x.label === 'string' && (x.label as string).trim() && typeof x.url === 'string' && /^https?:\/\//i.test(x.url as string)).map(x => ({ label: (x.label as string).trim().slice(0, 40), url: (x.url as string).slice(0, 1000) })).slice(0, 2) : []
        if (btns.length) card.buttons = btns
        return card
      }).filter(c => c.image || c.title || c.text || (Array.isArray(c.buttons) && c.buttons.length)).slice(0, 10)
      if (cards.length) out.push({ type: 'carousel', cards })
    }
  }
  return out.slice(0, 20)
}
