'use client'
import { useState, useEffect } from 'react'
import type { Template, TemplateBlock } from '../messages/MessagesClient'
import { EXAMPLE, VARDESC } from './messaging-sections'

export type EditBlock = TemplateBlock

// 既存テンプレを編集用ブロック列へ：blocks があればそれ、無ければ旧 body/attachments/buttons から合成（後方互換表示）。
export function templateToBlocks(t: { blocks?: TemplateBlock[] | null; body?: string | null; attachments?: { type?: string; path?: string }[] | null; buttons?: { label?: string; url?: string }[] | null } | null): EditBlock[] {
  if (!t) return []
  if (t.blocks && t.blocks.length) return t.blocks.map(b => ({ ...b }))
  const out: EditBlock[] = []
  if (t.body && t.body.trim()) out.push({ type: 'text', text: t.body })
  for (const a of t.attachments ?? []) if (a?.type === 'image' && a?.path) out.push({ type: 'image', path: a.path })
  for (const b of t.buttons ?? []) if (b?.label && /^https?:\/\//i.test(b?.url ?? '')) out.push({ type: 'button', label: b.label, url: b.url as string })
  return out
}
// 編集ブロック→保存payload（空ブロック・空カード除外）。
const cardHas = (c: { image?: string; title?: string; text?: string; buttons?: { label: string; url: string }[] }) => !!(c.image || c.title?.trim() || c.text?.trim() || c.buttons?.some(b => b.label.trim() && /^https?:\/\//i.test(b.url)))
export function cleanBlocks(blocks: EditBlock[]): EditBlock[] {
  const out: EditBlock[] = []
  for (const b of blocks) {
    if (b.type === 'text' && b.text.trim()) out.push(b)
    else if (b.type === 'image' && b.path) out.push(b)
    else if (b.type === 'button' && b.label.trim() && /^https?:\/\//i.test(b.url)) out.push(b)
    else if (b.type === 'carousel') {
      const cards = b.cards.map(c => ({ ...c, buttons: (c.buttons ?? []).filter(bt => bt.label.trim() && /^https?:\/\//i.test(bt.url)) })).filter(cardHas)
      if (cards.length) out.push({ type: 'carousel', cards })
    }
  }
  return out
}

// 狭幅判定（モバイルで list→編集 切替するため）。SSR安全（初期は false）。
export function useIsNarrow(maxWidth = 820): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const on = () => setNarrow(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [maxWidth])
  return narrow
}

// Phase3-D②：テンプレ/自動メッセージUIの共有クライアントヘルパー。
// ★純データ（SECTIONS/EXAMPLE 等）は messaging-sections.ts（非client）に分離（サーバーからも import するため）。
// ★UI専用。CRUD API・resolveTemplate/Media・送信ロジックには一切触れない。

export function ChannelBadge({ channel }: { channel: Template['channel'] }) {
  const isLine = channel === 'line'
  const isMail = channel === 'email'
  const label = isLine ? 'LINE用' : isMail ? 'メール用' : channel === 'both' ? 'LINE/メール' : '汎用'
  const color = isLine ? 'var(--c-success)' : isMail ? 'var(--c-info)' : 'var(--t-tertiary)'
  const bg = isLine ? 'rgba(30,158,106,0.1)' : isMail ? 'rgba(55,138,221,0.12)' : 'var(--s-2)'
  return <span style={{ fontSize: '.5rem', fontWeight: 800, color, background: bg, borderRadius: 5, padding: '2px 7px' }}>{label}</span>
}

// イベント別アイコン（LINE=緑系地/メール=青系地）。Tabler相当を inline SVG で。
export function EventIcon({ category, channel, size = 36 }: { category: string; channel: Template['channel']; size?: number }) {
  const isLine = channel === 'line'
  const bg = isLine ? '#E1F5EE' : '#E6F1FB'
  const fg = isLine ? 'var(--c-success)' : 'var(--c-info)'
  const paths: Record<string, React.ReactNode> = {
    greeting: <><path d="M8 9h8M8 13h5" /><path d="M21 12a8 8 0 01-8 8H7l-4 3 1-5a8 8 0 1117-6z" /></>,
    'deal-won': <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0z" /><path d="M5 6H3v1a3 3 0 003 3M19 6h2v1a3 3 0 01-3 3" /></>,
    recognition: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8l2 2 3-3" /></>,
    nudge: <><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>,
    receipt: <><path d="M4 4h16v16l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M8 9h8M8 13h6" /></>,
    booking: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    'payout-confirmed': <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4" /></>,
  }
  return (
    <span style={{ width: size, height: size, borderRadius: 9, background: bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[category] ?? <circle cx="12" cy="12" r="9" />}</svg>
    </span>
  )
}

// URLボタン編集（最大3・ラベル＋リンク先・追加/削除/並べ替え）。
export type EditButton = { label: string; url: string }
export function ButtonsField({ buttons, setButtons }: { buttons: EditButton[]; setButtons: (b: EditButton[]) => void }) {
  const set = (i: number, patch: Partial<EditButton>) => setButtons(buttons.map((b, j) => j === i ? { ...b, ...patch } : b))
  const add = () => { if (buttons.length < 3) setButtons([...buttons, { label: '', url: '' }]) }
  const del = (i: number) => setButtons(buttons.filter((_, j) => j !== i))
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= buttons.length) return; const next = [...buttons]; [next[i], next[j]] = [next[j], next[i]]; setButtons(next) }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--t-tertiary)' }}>ボタン（最大3個・タップでURLを開く）</div>
        {buttons.length < 3 && <button type="button" onClick={add} style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--c-blue)', background: 'var(--c-ghost-bg)', border: '1px solid var(--c-ring-soft)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>＋ 追加</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {buttons.map((b, i) => (
          <div key={i} style={{ border: '1px solid var(--c-hairline)', borderRadius: 10, padding: '11px 12px', background: 'var(--s-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--t-secondary)' }}>ボタン {i + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {buttons.length > 1 && (
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="上へ" style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--line)' : 'var(--t-tertiary)', fontSize: 11, lineHeight: 1, padding: 0 }}>▲</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === buttons.length - 1} title="下へ" style={{ border: 'none', background: 'transparent', cursor: i === buttons.length - 1 ? 'default' : 'pointer', color: i === buttons.length - 1 ? 'var(--line)' : 'var(--t-tertiary)', fontSize: 11, lineHeight: 1, padding: 0 }}>▼</button>
                  </span>
                )}
                <button type="button" onClick={() => del(i)} title="削除" style={{ border: 'none', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: '.58rem', fontWeight: 700 }}>削除</button>
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: 7 }}>
              <span style={{ display: 'block', fontSize: '.54rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 3 }}>ボタンの文字</span>
              <input className="ui-field" value={b.label} onChange={e => set(i, { label: e.target.value })} placeholder="例：詳しく見る" />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: '.54rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 3 }}>リンク先（URL）</span>
              <input className="ui-field" value={b.url} onChange={e => set(i, { url: e.target.value })} placeholder="例：https://mb-partners.app/app" />
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

// 届くイメージ内のボタン描画（LINE/メール共通の見た目）。
export function PreviewButtons({ buttons }: { buttons: EditButton[] }) {
  const valid = buttons.filter(b => b.label && /^https?:\/\//i.test(b.url))
  if (!valid.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {valid.map((b, i) => (
        <div key={i} style={{ textAlign: 'center', background: 'var(--c-blue)', color: '#fff', fontWeight: 700, fontSize: '.68rem', borderRadius: 8, padding: '8px 10px' }}>{b.label}</div>
      ))}
    </div>
  )
}

// 番号付きセクション見出し（① 本文／② 画像／③ ボタン のリズム）。
export function SectionHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 9, background: 'var(--c-blue)', color: '#fff', fontSize: '.6rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(1px)' }}>{n}</span>
      <span style={{ fontSize: '.78rem', fontWeight: 800 }}>{title}</span>
      {hint && <span style={{ fontSize: '.58rem', color: 'var(--t-tertiary)' }}>{hint}</span>}
    </div>
  )
}

// 画像セクション（選ぶ／差し替え／削除が分かる）。
export function ImageField({ imgUrl, onPick, onRemove }: { imgUrl: string; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; onRemove: () => void }) {
  return imgUrl ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgUrl} alt="添付画像" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--line)' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.62rem', padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>差し替え<input type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} /></label>
        <button type="button" onClick={onRemove} className="ui-btn ui-btn--ghost" style={{ fontSize: '.62rem', padding: '6px 12px', borderRadius: 7, color: 'var(--c-danger)', cursor: 'pointer' }}>削除</button>
      </div>
    </div>
  ) : (
    <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.64rem', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
      画像を選ぶ<input type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
    </label>
  )
}

// 実物大プレビュー：LINE用＝トーク風カード（薄青背景・アイコン・小カード・既読）、メール用＝メール体裁。
export function RichPreview({ channel, imgUrl, body, placeholder, buttons, accountName = 'MB Partners' }: { channel: Template['channel']; imgUrl?: string; body?: string; placeholder?: string; buttons: EditButton[]; accountName?: string }) {
  const valid = buttons.filter(b => b.label && /^https?:\/\//i.test(b.url))
  const text = body || ''
  if (channel === 'email') {
    return (
      <div style={{ background: 'var(--s-1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 13px', borderBottom: '1px solid var(--c-hairline)', fontSize: '.6rem', color: 'var(--t-tertiary)' }}>差出人：MB Partners 運営事務局</div>
        <div style={{ padding: '13px', fontSize: '.72rem', lineHeight: 1.75, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text || <span style={{ color: 'var(--t-tertiary)' }}>{placeholder}</span>}
          {imgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl} alt="" style={{ display: 'block', maxWidth: 180, borderRadius: 8, marginTop: 8 }} />}
          {valid.length > 0 && <div style={{ marginTop: 10 }}>{valid.map((b, i) => <div key={i} style={{ display: 'inline-block', background: 'var(--c-blue)', color: '#fff', fontWeight: 700, fontSize: '.66rem', borderRadius: 8, padding: '8px 16px', margin: '0 6px 6px 0' }}>{b.label}</div>)}</div>}
        </div>
      </div>
    )
  }
  // LINE トーク風（実物大・カード幅 ~214px）
  return (
    <div style={{ background: '#9CB7D6', borderRadius: 14, padding: '16px 12px 14px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 16, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.12)' }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-blue)' }}>M</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '.54rem', marginBottom: 3, color: 'rgba(255,255,255,.9)' }}>{accountName}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
            <div style={{ width: 214, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.1)' }}>
              {imgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl} alt="" style={{ display: 'block', width: '100%', height: 139, objectFit: 'cover' }} />}
              <div style={{ padding: '10px 12px', fontSize: '.7rem', lineHeight: 1.65, color: '#0A0A0A', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {text || <span style={{ color: '#94A3B8' }}>{placeholder}</span>}
              </div>
              {valid.length > 0 && (
                <div style={{ borderTop: '1px solid #EEF0F4' }}>
                  {valid.map((b, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '10px 8px', fontSize: '.68rem', fontWeight: 700, color: 'var(--c-blue)', borderTop: i === 0 ? 'none' : '1px solid #EEF0F4' }}>{b.label}</div>
                  ))}
                </div>
              )}
            </div>
            <span style={{ flexShrink: 0, fontSize: '.46rem', color: 'rgba(255,255,255,.85)', marginBottom: 2 }}>既読<br />14:30</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───── エルメ型ブロックビルダー ─────
const blockIcon = (t: string) => t === 'text' ? '✏️' : t === 'image' ? '🖼️' : t === 'button' ? '🔘' : '🎠'
const blockName = (t: string) => t === 'text' ? 'テキスト' : t === 'image' ? '画像' : t === 'button' ? 'ボタン' : 'カルーセル'

type Card = { image?: string; title?: string; text?: string; tapUrl?: string; buttons?: { label: string; url: string }[] }

function CarouselEditor({ cards, setCards, urls, setUrls }: { cards: Card[]; setCards: (c: Card[]) => void; urls: Record<string, string>; setUrls: (fn: (p: Record<string, string>) => Record<string, string>) => void }) {
  const upd = (i: number, patch: Partial<Card>) => setCards(cards.map((c, j) => j === i ? { ...c, ...patch } : c))
  const del = (i: number) => setCards(cards.filter((_, j) => j !== i))
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= cards.length) return; const n = [...cards]; [n[i], n[j]] = [n[j], n[i]]; setCards(n) }
  const addCard = () => { if (cards.length < 10) setCards([...cards, {}]) }
  async function pick(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    const up = await uploadImage(file); if (!up) return
    setUrls(p => ({ ...p, [up.path]: up.previewUrl })); upd(i, { image: up.path })
  }
  const setBtn = (i: number, bi: number, patch: Partial<{ label: string; url: string }>) => { const bs = [...(cards[i].buttons ?? [])]; bs[bi] = { ...(bs[bi] ?? { label: '', url: '' }), ...patch }; upd(i, { buttons: bs }) }
  const addBtn = (i: number) => { const bs = [...(cards[i].buttons ?? [])]; if (bs.length < 2) { bs.push({ label: '', url: '' }); upd(i, { buttons: bs }) } }
  const delBtn = (i: number, bi: number) => upd(i, { buttons: (cards[i].buttons ?? []).filter((_, j) => j !== bi) })
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ flexShrink: 0, width: 210, border: '1px solid var(--c-hairline)', borderRadius: 10, background: 'var(--s-0)', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--t-secondary)' }}>カード {i + 1}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="左へ" style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--line)' : 'var(--t-tertiary)', fontSize: 11, padding: 0 }}>◀</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === cards.length - 1} title="右へ" style={{ border: 'none', background: 'transparent', cursor: i === cards.length - 1 ? 'default' : 'pointer', color: i === cards.length - 1 ? 'var(--line)' : 'var(--t-tertiary)', fontSize: 11, padding: 0 }}>▶</button>
                <button type="button" onClick={() => del(i)} title="削除" style={{ border: 'none', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: '.54rem', fontWeight: 700 }}>削除</button>
              </span>
            </div>
            {c.image && urls[c.image] ? (
              <div style={{ position: 'relative', marginBottom: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[c.image]} alt="" style={{ display: 'block', width: '100%', height: 100, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--line)' }} />
                <button type="button" onClick={() => upd(i, { image: undefined })} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.56rem', padding: '5px 8px', borderRadius: 6, cursor: 'pointer', display: 'block', textAlign: 'center', marginBottom: 6 }}>画像を選ぶ<input type="file" accept="image/*" onChange={e => pick(i, e)} style={{ display: 'none' }} /></label>
            )}
            <input className="ui-field" value={c.tapUrl ?? ''} onChange={e => upd(i, { tapUrl: e.target.value })} placeholder="画像タップURL（任意）" style={{ fontSize: '.6rem', marginBottom: 5, padding: '6px 8px' }} />
            <input className="ui-field" value={c.title ?? ''} onChange={e => upd(i, { title: e.target.value })} placeholder="見出し（任意）" style={{ fontSize: '.62rem', marginBottom: 5, padding: '6px 8px' }} />
            <textarea className="ui-field" value={c.text ?? ''} onChange={e => upd(i, { text: e.target.value })} placeholder="説明（任意）" rows={2} style={{ fontSize: '.62rem', marginBottom: 5, padding: '6px 8px', resize: 'vertical' }} />
            {(c.buttons ?? []).map((bt, bi) => (
              <div key={bi} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <input className="ui-field" value={bt.label} onChange={e => setBtn(i, bi, { label: e.target.value })} placeholder="ボタン文字" style={{ fontSize: '.58rem', padding: '5px 7px', flex: '0 0 42%' }} />
                <input className="ui-field" value={bt.url} onChange={e => setBtn(i, bi, { url: e.target.value })} placeholder="https://…" style={{ fontSize: '.58rem', padding: '5px 7px', flex: 1 }} />
                <button type="button" onClick={() => delBtn(i, bi)} style={{ flexShrink: 0, border: 'none', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12 }}>×</button>
              </div>
            ))}
            {(c.buttons?.length ?? 0) < 2 && <button type="button" onClick={() => addBtn(i)} style={{ fontSize: '.56rem', color: 'var(--c-blue)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0' }}>＋ ボタン</button>}
          </div>
        ))}
        {cards.length < 10 && (
          <button type="button" onClick={addCard} style={{ flexShrink: 0, width: 80, border: '1px dashed var(--line-2)', borderRadius: 10, background: 'var(--s-1)', color: 'var(--c-blue)', fontSize: '.6rem', fontWeight: 700, cursor: 'pointer' }}>＋ カード</button>
        )}
      </div>
    </div>
  )
}

export function makeBlock(t: 'text' | 'image' | 'button' | 'carousel'): EditBlock {
  return t === 'text' ? { type: 'text', text: '' } : t === 'image' ? { type: 'image', path: '' } : t === 'button' ? { type: 'button', label: '', url: '' } : { type: 'carousel', cards: [{}, {}] }
}
// 既定文面（テキスト）を「たたき台」blocks へ展開（表示/初期値生成のみ・resolve/送信は不変）。
export function blocksFromDefaultText(text: string): EditBlock[] {
  return text && text.trim() ? [{ type: 'text', text }] : []
}
// 見出し位置に常駐する「ブロック追加」メニュー。
export function BlockAddBar({ blocks, setBlocks }: { blocks: EditBlock[]; setBlocks: (b: EditBlock[]) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {(['text', 'image', 'button', 'carousel'] as const).map(t => (
        <button key={t} type="button" onClick={() => setBlocks([...blocks, makeBlock(t)])} className="ui-btn ui-btn--secondary" style={{ fontSize: '.58rem', padding: '5px 9px', borderRadius: 7, cursor: 'pointer' }}>＋ {blockName(t)}</button>
      ))}
    </div>
  )
}

export function BlockBuilder({ blocks, setBlocks, urls, setUrls, vars = [], hideAdd = false }: { blocks: EditBlock[]; setBlocks: (b: EditBlock[]) => void; urls: Record<string, string>; setUrls: (fn: (p: Record<string, string>) => Record<string, string>) => void; vars?: string[]; hideAdd?: boolean }) {
  const [focusText, setFocusText] = useState<number | null>(null)
  const upd = (i: number, patch: Partial<EditBlock>) => setBlocks(blocks.map((b, j) => j === i ? ({ ...b, ...patch } as EditBlock) : b))
  const del = (i: number) => setBlocks(blocks.filter((_, j) => j !== i))
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; setBlocks(n) }
  const add = (t: 'text' | 'image' | 'button' | 'carousel') => setBlocks([...blocks, makeBlock(t)])
  async function pickImage(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    const up = await uploadImage(file); if (!up) return
    setUrls(p => ({ ...p, [up.path]: up.previewUrl })); upd(i, { path: up.path } as Partial<EditBlock>)
  }
  function insertVar(v: string) {
    const token = '${' + v + '}'
    const idx = focusText != null && blocks[focusText]?.type === 'text' ? focusText : blocks.map(b => b.type).lastIndexOf('text')
    if (idx >= 0) upd(idx, { text: ((blocks[idx] as { text: string }).text || '') + token } as Partial<EditBlock>)
    else setBlocks([...blocks, { type: 'text', text: token }])
  }
  return (
    <div>
      {vars.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '.56rem', color: 'var(--t-tertiary)', marginBottom: 5 }}>差し込み項目</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {vars.map(v => <button key={v} type="button" onClick={() => insertVar(v)} title={EXAMPLE[v] ? `例：${EXAMPLE[v]}` : ''} style={{ fontSize: '.58rem', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>{VARDESC[v] ?? v}</button>)}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {blocks.map((b, i) => (
          <div key={i} style={{ border: '1px solid var(--c-hairline)', borderRadius: 10, background: 'var(--s-1)', padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--t-secondary)' }}>{blockIcon(b.type)} {blockName(b.type)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="上へ" style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--line)' : 'var(--t-tertiary)', fontSize: 12, padding: 0 }}>▲</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="下へ" style={{ border: 'none', background: 'transparent', cursor: i === blocks.length - 1 ? 'default' : 'pointer', color: i === blocks.length - 1 ? 'var(--line)' : 'var(--t-tertiary)', fontSize: 12, padding: 0 }}>▼</button>
                <button type="button" onClick={() => del(i)} title="削除" style={{ border: 'none', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: '.58rem', fontWeight: 700 }}>削除</button>
              </div>
            </div>
            {b.type === 'text' && <textarea className="ui-field" value={b.text} onChange={e => upd(i, { text: e.target.value } as Partial<EditBlock>)} onFocus={() => setFocusText(i)} rows={3} style={{ resize: 'vertical' }} placeholder="テキストを入力…" />}
            {b.type === 'image' && (
              <div>
                <div style={{ marginBottom: 8 }}><ImageField imgUrl={b.path ? (urls[b.path] || '') : ''} onPick={e => pickImage(i, e)} onRemove={() => upd(i, { path: '' } as Partial<EditBlock>)} /></div>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: '.54rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 3 }}>タップで開くURL（任意）</span>
                  <input className="ui-field" value={b.url ?? ''} onChange={e => upd(i, { url: e.target.value } as Partial<EditBlock>)} placeholder="例：https://mb-partners.app/app" />
                </label>
              </div>
            )}
            {b.type === 'button' && (
              <div>
                <label style={{ display: 'block', marginBottom: 7 }}>
                  <span style={{ display: 'block', fontSize: '.54rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 3 }}>ボタンの文字</span>
                  <input className="ui-field" value={b.label} onChange={e => upd(i, { label: e.target.value } as Partial<EditBlock>)} placeholder="例：詳しく見る" />
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: '.54rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 3 }}>リンク先（URL）</span>
                  <input className="ui-field" value={b.url} onChange={e => upd(i, { url: e.target.value } as Partial<EditBlock>)} placeholder="例：https://mb-partners.app/app" />
                </label>
              </div>
            )}
            {b.type === 'carousel' && <CarouselEditor cards={b.cards} setCards={cs => upd(i, { cards: cs } as Partial<EditBlock>)} urls={urls} setUrls={setUrls} />}
          </div>
        ))}
      </div>
      {!hideAdd && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {(['text', 'image', 'button', 'carousel'] as const).map(t => (
            <button key={t} type="button" onClick={() => add(t)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.62rem', padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>＋ {blockName(t)}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ブロック列の実物大プレビュー（LINEトーク風 / メール体裁）。
export function BlocksPreview({ channel, blocks, urls }: { channel: Template['channel']; blocks: EditBlock[]; urls: Record<string, string> }) {
  const card = blocks.filter(b => (b.type === 'text' && b.text.trim()) || (b.type === 'image' && b.path) || (b.type === 'button' && b.label && /^https?:\/\//i.test(b.url)) || (b.type === 'carousel' && b.cards.length > 0))
  if (channel === 'email') {
    return (
      <div style={{ background: 'var(--s-1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 13px', borderBottom: '1px solid var(--c-hairline)', fontSize: '.6rem', color: 'var(--t-tertiary)' }}>差出人：MB Partners 運営事務局</div>
        <div style={{ padding: '13px' }}>
          {card.length === 0 && <span style={{ fontSize: '.7rem', color: 'var(--t-tertiary)' }}>ブロックを追加すると、ここに表示されます</span>}
          {card.map((b, i) => b.type === 'text' ? <div key={i} style={{ fontSize: '.72rem', lineHeight: 1.75, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 10 }}>{b.text}</div>
            : b.type === 'image' ? (urls[b.path] ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={urls[b.path]} alt="" style={{ display: 'block', maxWidth: 200, borderRadius: 8, marginBottom: 10 }} /> : null)
            : b.type === 'button' ? <div key={i} style={{ marginBottom: 8 }}><span style={{ display: 'inline-block', background: 'var(--c-blue)', color: '#fff', fontWeight: 700, fontSize: '.66rem', borderRadius: 8, padding: '8px 16px' }}>{b.label}</span></div>
            : <div key={i} style={{ marginBottom: 10 }}>{b.cards.map((c, ci) => (
                <div key={ci} style={{ border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden', maxWidth: 240, marginBottom: 8 }}>
                  {c.image && urls[c.image] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[c.image]} alt="" style={{ display: 'block', width: '100%' }} />}
                  {(c.title || c.text || c.buttons?.length) && <div style={{ padding: '8px 10px' }}>
                    {c.title && <div style={{ fontWeight: 700, fontSize: '.66rem' }}>{c.title}</div>}
                    {c.text && <div style={{ fontSize: '.6rem', color: '#555', marginTop: 2 }}>{c.text}</div>}
                    {(c.buttons ?? []).map((bt, k) => <div key={k} style={{ marginTop: 5 }}><span style={{ display: 'inline-block', background: 'var(--c-blue)', color: '#fff', fontWeight: 700, fontSize: '.6rem', borderRadius: 6, padding: '5px 12px' }}>{bt.label}</span></div>)}
                  </div>}
                </div>
              ))}</div>)}
        </div>
      </div>
    )
  }
  // LINE トーク風（各ブロックを順に・吹き出し/カード）
  return (
    <div style={{ background: '#9CB7D6', borderRadius: 14, padding: '16px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 16, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.12)' }}><span style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-blue)' }}>M</span></div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {card.length === 0 && <div style={{ fontSize: '.62rem', color: 'rgba(255,255,255,.92)' }}>ブロックを追加すると、ここに表示されます</div>}
          {card.map((b, i) => b.type === 'text' ? (
            <div key={i} style={{ maxWidth: 214, background: '#fff', borderRadius: 12, padding: '9px 12px', fontSize: '.7rem', lineHeight: 1.65, color: '#0A0A0A', whiteSpace: 'pre-wrap', wordBreak: 'break-word', boxShadow: '0 1px 2px rgba(0,0,0,.1)' }}>{b.text}</div>
          ) : b.type === 'image' ? (urls[b.path] ? (
            <div key={i} style={{ width: 214, borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.1)', position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[b.path]} alt="" style={{ display: 'block', width: '100%' }} />
              {b.url && <span style={{ position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '.48rem', padding: '2px 6px', borderRadius: 5 }}>🔗 リンク</span>}
            </div>
          ) : null) : b.type === 'button' ? (
            <div key={i} style={{ width: 214, background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.1)' }}>
              <div style={{ textAlign: 'center', padding: '11px 8px', fontSize: '.68rem', fontWeight: 700, color: 'var(--c-blue)' }}>{b.label}</div>
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: 230, paddingBottom: 4 }}>
              {b.cards.map((c, ci) => (
                <div key={ci} style={{ flexShrink: 0, width: 158, background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.12)' }}>
                  {c.image && urls[c.image] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[c.image]} alt="" style={{ display: 'block', width: '100%', height: 103, objectFit: 'cover' }} />}
                  {(c.title || c.text) && <div style={{ padding: '7px 9px' }}>
                    {c.title && <div style={{ fontWeight: 700, fontSize: '.62rem', color: '#0A0A0A' }}>{c.title}</div>}
                    {c.text && <div style={{ fontSize: '.54rem', color: '#666', marginTop: 2, lineHeight: 1.5 }}>{c.text}</div>}
                  </div>}
                  {(c.buttons ?? []).map((bt, k) => <div key={k} style={{ borderTop: '1px solid #EEF0F4', textAlign: 'center', padding: '7px 4px', fontSize: '.56rem', fontWeight: 700, color: 'var(--c-blue)' }}>{bt.label}</div>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export async function uploadImage(file: File): Promise<{ path: string; previewUrl: string } | null> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
  const res = await fetch('/api/console/messages/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64: dataUrl }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.attachment) return null
  return { path: j.attachment.path as string, previewUrl: (j.previewUrl as string) || '' }
}
