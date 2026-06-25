'use client'
import { useState, useRef } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import type { Template, Attachment } from '../MessagesClient'

// LINE=緑系 / メール=青系 で種類を明示。
function ChannelBadge({ channel }: { channel: Template['channel'] }) {
  const isLine = channel === 'line'
  const isMail = channel === 'email'
  const label = isLine ? 'LINE用' : isMail ? 'メール用' : channel === 'both' ? 'LINE/メール' : '汎用'
  const color = isLine ? 'var(--c-success)' : isMail ? 'var(--c-info)' : 'var(--t-tertiary)'
  const bg = isLine ? 'rgba(30,158,106,0.1)' : isMail ? 'rgba(55,138,221,0.12)' : 'var(--s-2)'
  return <span style={{ fontSize: '.5rem', fontWeight: 800, color, background: bg, borderRadius: 5, padding: '2px 7px' }}>{label}</span>
}

async function uploadImage(file: File): Promise<{ path: string; previewUrl: string } | null> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
  const res = await fetch('/api/console/messages/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64: dataUrl }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.attachment) return null
  return { path: j.attachment.path as string, previewUrl: (j.previewUrl as string) || '' }
}

// 差し込み変数 → 日本語説明＋プレビュー実例値。
const EXAMPLE: Record<string, string> = {
  name: '勝田 勝彦', customer: '田中商事', month: '2026年6月', amount: '¥50,000',
  thanks: 'これまでのご紹介、ありがとうございます。', kind: 'ご紹介の登録',
  service: 'Webサイト制作', meeting: '2026年6月25日 14:00', when: '2026年6月25日 14:00',
  meetingUrl: 'https://meet.google.com/xxx-xxxx-xxx',
}
const VARDESC: Record<string, string> = {
  name: 'パートナー/宛先のお名前', customer: 'お客さま（紹介先）の名前', month: '対象月', amount: '手取り金額（自動・編集不可）',
  thanks: '過去成約があれば感謝の一言（自動）', kind: '受付の種別', service: 'サービス名', meeting: '商談日時', when: '予約日時', meetingUrl: 'オンライン会議URL',
}
function fillExample(body: string): string { return body.replace(/\$\{(\w+)\}/g, (whole, k: string) => EXAMPLE[k] ?? whole) }

type Section = { key: string; label: string; desc: string; channel: Template['channel']; vars: string[]; defaultText: string; sample: string }
const SECTIONS: Section[] = [
  { key: 'greeting', label: 'あいさつ（友だち追加時）', desc: 'LINEで友だち追加された直後に自動返信します。', channel: 'line', vars: [],
    defaultText: '（未設定。設定しない場合は LINE公式アカウント Manager 側のあいさつメッセージに委ねます）',
    sample: '友だち追加ありがとうございます！MB Partners です。ご紹介のご相談はこのトークからお気軽にどうぞ。' },
  { key: 'deal-won', label: '成約（勝ち通知）', desc: '担当紹介が成約した時に、パートナー本人へ通知します。', channel: 'line', vars: ['customer'],
    defaultText: '${customer} のご紹介が成約に至りました。報酬の詳細は実績画面でご確認いただけます。',
    sample: '🎉 ${customer} のご紹介が成約しました！あなたの一歩が実を結びました。報酬は実績画面でご確認いただけます。' },
  { key: 'recognition', label: '賞賛（仲間が増えた）', desc: '紹介した相手が参加した時に、紹介元のパートナーへ。', channel: 'line', vars: ['name'],
    defaultText: 'あなたの紹介に、心から感謝します。信頼の輪が、あなたから確かに広がっています。これからもどうぞよろしくお願いします。— MB Partners',
    sample: '${name}さんが仲間入りしました。あなたの紹介が、新しいつながりを生んでいます。心から感謝します。— MB Partners' },
  { key: 'nudge', label: '再活性化ナッジ', desc: '休眠中のパートナーへ手動で送るお声がけの本文。', channel: 'line', vars: ['name', 'thanks'],
    defaultText: '${name}さん、お久しぶりです。最近、MB Partnersでご紹介できそうな方はいませんか？\n${thanks}',
    sample: '${name}さん、お久しぶりです！最近お変わりないですか？ご紹介できそうな方がいれば、いつでもご連絡ください。${thanks}' },
  { key: 'receipt', label: '受付確認メール', desc: '紹介/協力/商談予約の受付完了時にパートナー本人へ送るメール本文。', channel: 'email', vars: ['name', 'kind', 'customer', 'service', 'meeting'],
    defaultText: '${name} 様\n\n${kind}を受け付けました。内容は以下のとおりです。\n・お客さま：${customer}\n（この後の流れ：MB確認 → 商談・提案 → 成約で報酬）',
    sample: '${name} 様\n\nこの度はご紹介ありがとうございます。${customer} 様の${kind}を受け付けました。担当より順次ご連絡します。引き続きよろしくお願いいたします。' },
  { key: 'booking', label: '予約完了メール（顧客）', desc: 'お客さまへ送る予約完了メールの本文。', channel: 'email', vars: ['name', 'when', 'meetingUrl'],
    defaultText: '${name} 様\n\nご予約を承りました。当日はどうぞよろしくお願いいたします。\n▼ 日時\n${when}',
    sample: '${name} 様\n\nご予約ありがとうございます。下記日時で承りました。当日お会いできるのを楽しみにしております。\n▼ 日時\n${when}\n▼ 会議URL\n${meetingUrl}' },
  { key: 'payout-confirmed', label: '報酬確定メール', desc: '月末締めの確定時にパートナー本人へ。金額は自動算出で固定です。', channel: 'email', vars: ['name', 'month', 'amount'],
    defaultText: '${name} 様\n${month} 分の報酬が確定しました。\n・手取り：${amount}\n明細はアプリの「報酬」からご確認いただけます。',
    sample: '${name} 様\n\nお疲れさまです。${month} 分の報酬が確定しました。\n・手取り：${amount}\nいつもご紹介ありがとうございます。明細はアプリの「報酬」からどうぞ。' },
]
const SECTION_KEYS = new Set(SECTIONS.map(s => s.key))

// ── セクションカード（インライン編集・既定表示・変数・プレビュー・画像）─────────────
function SectionCard({ section, existing, signedUrls, onSaved, onReset }: { section: Section; existing: Template | null; signedUrls: Record<string, string>; onSaved: (t: Template) => void; onReset: (category: string) => void }) {
  const initImg = existing?.attachments?.find(a => a.type === 'image')?.path ?? null
  const [body, setBody] = useState(existing?.body ?? '')
  const [imgPath, setImgPath] = useState<string | null>(initImg)
  const [imgUrl, setImgUrl] = useState<string>(initImg ? (signedUrls[initImg] ?? '') : '')
  const [showDefault, setShowDefault] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const isCustom = !!existing

  function insertVar(key: string) {
    const token = '${' + key + '}'
    const el = ref.current
    if (!el) { setBody(b => b + token); return }
    const s = el.selectionStart ?? body.length, e = el.selectionEnd ?? body.length
    setBody(body.slice(0, s) + token + body.slice(e))
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length })
  }
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setErr('')
    const up = await uploadImage(file)
    if (!up) { setErr('画像アップロードに失敗しました'); return }
    setImgPath(up.path); setImgUrl(up.previewUrl)
  }
  async function save() {
    if (busy || (!body.trim() && !imgPath)) return
    setBusy(true); setErr('')
    try {
      const attachments = imgPath ? [{ type: 'image', path: imgPath }] : []
      const payload = { title: section.label, body, category: section.key, channel: section.channel || null, attachments, sort_order: 0 }
      const res = existing
        ? await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '保存に失敗しました'); return }
      onSaved(j.template as Template)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function reset() {
    if (busy || !existing) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || '操作に失敗しました'); return }
      setBody(''); setImgPath(null); setImgUrl(''); onReset(section.key)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  const preview = fillExample(body || section.sample)
  return (
    <div className="ui-card" style={{ padding: '16px 18px' }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '.86rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{section.label}
          <span style={{ fontSize: '.5rem', fontWeight: 800, color: isCustom ? 'var(--c-success)' : 'var(--t-tertiary)', background: isCustom ? 'rgba(30,158,106,0.1)' : 'var(--s-2)', borderRadius: 5, padding: '2px 7px' }}>{isCustom ? 'カスタム文面を使用中' : '既定の文面を使用中'}</span>
          <ChannelBadge channel={section.channel} />
        </div>
        <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 3 }}>{section.desc}</div>
      </div>

      <button type="button" onClick={() => setShowDefault(v => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.6rem', fontWeight: 700, cursor: 'pointer', padding: '2px 0', marginBottom: 4 }}>
        {showDefault ? '▾ 現在の文面（既定）を隠す' : '▸ 現在の文面（既定）を見る'}
      </button>
      {showDefault && <div style={{ background: 'var(--s-1)', border: '1px solid var(--c-hairline)', borderRadius: 8, padding: '10px 12px', fontSize: '.66rem', color: 'var(--t-secondary)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{section.defaultText}</div>}

      {section.vars.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 5 }}>差し込み変数（クリックで本文に挿入）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {section.vars.map(v => (
              <button key={v} type="button" onClick={() => insertVar(v)} title={`${VARDESC[v]}（例：${EXAMPLE[v]}）`} style={{ fontSize: '.58rem', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                {'${' + v + '}'} <span style={{ color: 'var(--t-tertiary)', fontWeight: 600 }}>{VARDESC[v]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea ref={ref} className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={4} style={{ resize: 'vertical' }} placeholder={`例）${section.sample}`} />

      {/* 画像（任意・1枚） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        {imgUrl ? (
          <div style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl} alt="添付画像" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--line)' }} />
            <button type="button" onClick={() => { setImgPath(null); setImgUrl('') }} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}>×</button>
          </div>
        ) : (
          <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.6rem', padding: '5px 10px', borderRadius: 7, cursor: 'pointer' }}>画像を添付（任意）<input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} /></label>
        )}
        <span style={{ fontSize: '.56rem', color: 'var(--t-tertiary)' }}>{section.channel === 'email' ? 'メール添付として送られます' : 'LINE画像として本文と一緒に送られます'}</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 4 }}>プレビュー（実例値で置換した届くイメージ）{!body && '：未入力のためサンプルを表示'}</div>
        <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: '.72rem', lineHeight: 1.7, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview}</div>
      </div>

      {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        {isCustom && <Button variant="ghost" size="sm" busy={busy} onClick={reset}>既定に戻す</Button>}
        <Button variant="primary" size="sm" busy={busy} disabled={!body.trim() && !imgPath} onClick={save}>{isCustom ? '更新' : '設定する'}</Button>
      </div>
    </div>
  )
}

// ── 自由送信用テンプレ ─────────────────
type FreeDraft = { kind: 'line' | 'email'; title: string; subject: string; body: string }
const emptyFree: FreeDraft = { kind: 'line', title: '', subject: '', body: '' }

export default function TemplatesClient({ initial, signedUrls = {} }: { initial: Template[]; signedUrls?: Record<string, string> }) {
  const [list, setList] = useState<Template[]>(initial)
  const [draft, setDraft] = useState<FreeDraft>(emptyFree)
  const [img, setImg] = useState<{ path: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  const bySection = (key: string) => list.find(t => t.category === key) ?? null
  const freeTemplates = list.filter(t => !t.category || !SECTION_KEYS.has(t.category))

  function upsertLocal(t: Template) { setList(prev => prev.some(x => x.id === t.id) ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]) }
  function dropByCategory(key: string) { setList(prev => prev.filter(t => t.category !== key)) }

  async function onFreeImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setErr('')
    const up = await uploadImage(file)
    if (!up) { setErr('画像アップロードに失敗しました'); return }
    setImg({ path: up.path, url: up.previewUrl })
  }
  async function createFree() {
    if (busy || !draft.title.trim()) return
    setBusy(true); setErr('')
    try {
      const payload = {
        title: draft.title.trim(), body: draft.body, channel: draft.kind, category: '自由送信',
        subject: draft.kind === 'email' ? (draft.subject.trim() || null) : null,
        attachments: img ? [{ type: 'image', path: img.path }] : [],
      }
      const res = await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '作成に失敗しました'); return }
      setList(prev => [...prev, j.template as Template]); setDraft(emptyFree); setImg(null)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function removeFree(id: string) {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || '削除に失敗しました'); return }
      setList(prev => prev.filter(t => t.id !== id))
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  const thumb = (t: Template): string | null => { const p = t.attachments?.find(a => a.type === 'image')?.path; return p ? (signedUrls[p] ?? null) : null }

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>テンプレート管理</h1>
        <a href="/console/messages" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← メッセージへ</a>
      </div>

      {/* 自動メッセージのセクション */}
      <p className="caption" style={{ marginBottom: 4 }}>自動メッセージのセクション</p>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginBottom: 12 }}>各通知の文面と画像をカスタムに差し替えできます。未設定なら「現在の文面（既定）」がそのまま使われます。</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 34 }}>
        {SECTIONS.map(s => <SectionCard key={s.key} section={s} existing={bySection(s.key)} signedUrls={signedUrls} onSaved={upsertLocal} onReset={dropByCategory} />)}
      </div>

      {/* 自由送信用テンプレ */}
      <p className="caption" style={{ marginBottom: 4 }}>自由送信用テンプレート</p>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginBottom: 12 }}>メッセージ画面で手動送信するときに挿入できる定型文です。まず種類（LINE用／メール用）を選んでください。</p>
      <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', padding: '16px 18px', marginBottom: 14 }}>
        {/* 種類選択（最初） */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {(['line', 'email'] as const).map(k => (
            <button key={k} type="button" onClick={() => setDraft({ ...draft, kind: k })} className={`ui-btn ${draft.kind === k ? 'ui-btn--primary' : 'ui-btn--secondary'}`} style={{ fontSize: '.66rem', padding: '7px 14px', borderRadius: 8 }}>{k === 'line' ? 'LINE用' : 'メール用'}</button>
          ))}
        </div>
        <input className="ui-field" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="テンプレ名（例：お礼メッセージ）" style={{ marginBottom: 8 }} />
        {draft.kind === 'email' && <input className="ui-field" value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} placeholder="件名（メール用・任意）" style={{ marginBottom: 8 }} />}
        <textarea className="ui-field" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={3} style={{ resize: 'vertical', marginBottom: 8 }} placeholder="本文を入力…" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {img ? (
              <div style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="添付" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--line)' }} />
                <button type="button" onClick={() => setImg(null)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.6rem', padding: '5px 10px', borderRadius: 7, cursor: 'pointer' }}>画像を添付<input type="file" accept="image/*" onChange={onFreeImage} style={{ display: 'none' }} /></label>
            )}
          </div>
          <Button variant="primary" size="sm" busy={busy} disabled={!draft.title.trim()} onClick={createFree}>追加</Button>
        </div>
        {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '8px 0 0' }}>{err}</p>}
      </div>
      {freeTemplates.length === 0 ? (
        <EmptyState title="自由送信用テンプレートはまだありません" compact />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {freeTemplates.map(t => { const url = thumb(t); return (
            <div key={t.id} className="ui-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                {url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)', flexShrink: 0 }} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>{t.title}<ChannelBadge channel={t.channel} /></div>
                  {t.subject && <div style={{ fontSize: '.6rem', color: 'var(--t-tertiary)', marginTop: 2 }}>件名：{t.subject}</div>}
                  {t.body && <div style={{ fontSize: '.68rem', color: 'var(--muted2)', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.body}</div>}
                </div>
              </div>
              <Button variant="danger" size="sm" busy={busy} onClick={() => removeFree(t.id)}>削除</Button>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
