'use client'
import { useState, useRef } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import type { Template } from '../MessagesClient'

const chLabel = (c: Template['channel']) => c === 'line' ? 'LINE' : c === 'email' ? 'メール' : c === 'both' ? 'LINE/メール' : '汎用'

// 差し込み変数 → 日本語説明＋プレビュー実例値。
type VarDef = { key: string; desc: string; example: string }
const EXAMPLE: Record<string, string> = {
  name: '勝田 勝彦', customer: '田中商事', month: '2026年6月', amount: '¥50,000',
  thanks: 'これまでのご紹介、ありがとうございます。', kind: 'ご紹介の登録',
  service: 'Webサイト制作', meeting: '2026年6月25日 14:00', when: '2026年6月25日 14:00',
  meetingUrl: 'https://meet.google.com/xxx-xxxx-xxx',
}
const VARDEFS: Record<string, VarDef> = {
  name: { key: 'name', desc: 'パートナー/宛先のお名前', example: EXAMPLE.name },
  customer: { key: 'customer', desc: 'お客さま（紹介先）の名前', example: EXAMPLE.customer },
  month: { key: 'month', desc: '対象月', example: EXAMPLE.month },
  amount: { key: 'amount', desc: '手取り金額（自動算出・編集不可）', example: EXAMPLE.amount },
  thanks: { key: 'thanks', desc: '過去成約があれば感謝の一言（自動）', example: EXAMPLE.thanks },
  kind: { key: 'kind', desc: '受付の種別（紹介/協力/商談予約）', example: EXAMPLE.kind },
  service: { key: 'service', desc: 'サービス名', example: EXAMPLE.service },
  meeting: { key: 'meeting', desc: '商談日時', example: EXAMPLE.meeting },
  when: { key: 'when', desc: '予約日時', example: EXAMPLE.when },
  meetingUrl: { key: 'meetingUrl', desc: 'オンライン会議URL', example: EXAMPLE.meetingUrl },
}

// 自動メッセージのセクション。defaultText＝現状ハードコード既定文面（表示専用・コードと一致）。sample＝完成例文（プレースホルダ）。
type Section = { key: string; label: string; desc: string; channel: Template['channel']; vars: string[]; defaultText: string; sample: string }
const SECTIONS: Section[] = [
  { key: 'greeting', label: 'あいさつ（友だち追加時）', desc: 'LINEで友だち追加された直後に自動返信します。', channel: 'line', vars: [],
    defaultText: '（未設定。設定しない場合は LINE公式アカウント Manager 側のあいさつメッセージに委ねます）',
    sample: '友だち追加ありがとうございます！MB Partners です。ご紹介のご相談はこのトークからお気軽にどうぞ。' },
  { key: 'deal-won', label: '成約（勝ち通知）', desc: '担当紹介が成約した時に、パートナー本人へ通知します。', channel: '', vars: ['customer'],
    defaultText: '${customer} のご紹介が成約に至りました。報酬の詳細は実績画面でご確認いただけます。',
    sample: '🎉 ${customer} のご紹介が成約しました！あなたの一歩が実を結びました。報酬は実績画面でご確認いただけます。' },
  { key: 'recognition', label: '賞賛（仲間が増えた）', desc: '紹介した相手が参加した時に、紹介元のパートナーへ。', channel: '', vars: ['name'],
    defaultText: 'あなたの紹介に、心から感謝します。信頼の輪が、あなたから確かに広がっています。これからもどうぞよろしくお願いします。— MB Partners',
    sample: '${name}さんが仲間入りしました。あなたの紹介が、新しいつながりを生んでいます。心から感謝します。— MB Partners' },
  { key: 'nudge', label: '再活性化ナッジ', desc: '休眠中のパートナーへ手動で送るお声がけの本文。', channel: '', vars: ['name', 'thanks'],
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

function fillExample(body: string): string {
  return body.replace(/\$\{(\w+)\}/g, (whole, k: string) => EXAMPLE[k] ?? whole)
}

// ── セクションカード（インライン編集・既定表示・変数説明・プレビュー）─────────────────
function SectionCard({ section, existing, onSaved, onReset }: { section: Section; existing: Template | null; onSaved: (t: Template) => void; onReset: (category: string) => void }) {
  const [body, setBody] = useState(existing?.body ?? '')
  const [showDefault, setShowDefault] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const isCustom = !!existing

  function insertVar(key: string) {
    const token = '${' + key + '}'
    const el = ref.current
    if (!el) { setBody(b => b + token); return }
    const s = el.selectionStart ?? body.length, e = el.selectionEnd ?? body.length
    const next = body.slice(0, s) + token + body.slice(e)
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length })
  }

  async function save() {
    if (busy || !body.trim()) return
    setBusy(true); setErr('')
    try {
      const payload = { title: section.label, body, category: section.key, channel: section.channel || null, sort_order: 0 }
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
      setBody(''); onReset(section.key)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  const preview = fillExample(body || section.sample)
  return (
    <div className="ui-card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '.86rem', fontWeight: 800 }}>{section.label}
            <span style={{ marginLeft: 8, fontSize: '.5rem', fontWeight: 800, color: isCustom ? 'var(--c-success)' : 'var(--t-tertiary)', background: isCustom ? 'rgba(30,158,106,0.1)' : 'var(--s-2)', borderRadius: 5, padding: '2px 7px' }}>{isCustom ? 'カスタム文面を使用中' : '既定の文面を使用中'}</span>
            <span style={{ marginLeft: 6, fontSize: '.5rem', color: 'var(--t-tertiary)' }}>{chLabel(section.channel)}</span>
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 3 }}>{section.desc}</div>
        </div>
      </div>

      {/* 既定文面の実表示（折りたたみ） */}
      <button type="button" onClick={() => setShowDefault(v => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.6rem', fontWeight: 700, cursor: 'pointer', padding: '2px 0', marginBottom: 4 }}>
        {showDefault ? '▾ 現在の文面（既定）を隠す' : '▸ 現在の文面（既定）を見る'}
      </button>
      {showDefault && (
        <div style={{ background: 'var(--s-1)', border: '1px solid var(--c-hairline)', borderRadius: 8, padding: '10px 12px', fontSize: '.66rem', color: 'var(--t-secondary)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{section.defaultText}</div>
      )}

      {/* 変数チップ（クリック挿入） */}
      {section.vars.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 5 }}>差し込み変数（クリックで本文に挿入）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {section.vars.map(v => { const d = VARDEFS[v]; return (
              <button key={v} type="button" onClick={() => insertVar(v)} title={`${d.desc}（例：${d.example}）`} style={{ fontSize: '.58rem', fontFamily: 'var(--font-sans)', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                {'${' + v + '}'} <span style={{ color: 'var(--t-tertiary)', fontWeight: 600 }}>{d.desc}</span>
              </button>
            )})}
          </div>
        </div>
      )}

      {/* 本文（サンプル入りプレースホルダ） */}
      <textarea ref={ref} className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={4} style={{ resize: 'vertical' }} placeholder={`例）${section.sample}`} />

      {/* ライブプレビュー */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 4 }}>プレビュー（実例値で置換した届くイメージ）{!body && '：未入力のためサンプルを表示'}</div>
        <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: '.72rem', lineHeight: 1.7, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview}</div>
      </div>

      {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        {isCustom && <Button variant="ghost" size="sm" busy={busy} onClick={reset}>既定に戻す</Button>}
        <Button variant="primary" size="sm" busy={busy} disabled={!body.trim()} onClick={save}>{isCustom ? '更新' : '設定する'}</Button>
      </div>
    </div>
  )
}

// ── 自由送信用テンプレ（旧 自由作成・自動セクション以外）─────────────────
type FreeDraft = { title: string; body: string; channel: '' | 'line' | 'email' | 'both' }
const emptyFree: FreeDraft = { title: '', body: '', channel: '' }

export default function TemplatesClient({ initial }: { initial: Template[] }) {
  const [list, setList] = useState<Template[]>(initial)
  const [draft, setDraft] = useState<FreeDraft>(emptyFree)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  const bySection = (key: string) => list.find(t => t.category === key) ?? null
  const freeTemplates = list.filter(t => !t.category || !SECTION_KEYS.has(t.category))

  function upsertLocal(t: Template) { setList(prev => prev.some(x => x.id === t.id) ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]) }
  function dropByCategory(key: string) { setList(prev => prev.filter(t => t.category !== key)) }

  async function createFree() {
    if (busy || !draft.title.trim()) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: draft.title.trim(), body: draft.body, category: '自由送信', channel: draft.channel || null }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '作成に失敗しました'); return }
      setList(prev => [...prev, j.template as Template]); setDraft(emptyFree)
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

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 2 }}>司令塔</p>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>テンプレート管理</h1>
        </div>
        <a href="/console/messages" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← メッセージへ</a>
      </div>

      {/* 自動メッセージのセクション */}
      <p className="caption" style={{ marginBottom: 4 }}>自動メッセージのセクション</p>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginBottom: 12 }}>各通知の文面をカスタムに差し替えできます。未設定なら「現在の文面（既定）」がそのまま使われます。</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 34 }}>
        {SECTIONS.map(s => (
          <SectionCard key={s.key} section={s} existing={bySection(s.key)} onSaved={upsertLocal} onReset={dropByCategory} />
        ))}
      </div>

      {/* 自由送信用テンプレ */}
      <p className="caption" style={{ marginBottom: 4 }}>自由送信用テンプレート</p>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginBottom: 12 }}>メッセージ画面の「テンプレート」から手動送信時に挿入できる定型文です。</p>
      <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', padding: '16px 18px', marginBottom: 14 }}>
        <input className="ui-field" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="テンプレ名（例：お礼メッセージ）" style={{ marginBottom: 8 }} />
        <textarea className="ui-field" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={3} style={{ resize: 'vertical', marginBottom: 8 }} placeholder="本文を入力…" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <select className="ui-field" value={draft.channel} onChange={e => setDraft({ ...draft, channel: e.target.value as FreeDraft['channel'] })} style={{ width: 160 }}><option value="">汎用</option><option value="line">LINE</option><option value="email">メール</option><option value="both">LINE/メール</option></select>
          <Button variant="primary" size="sm" busy={busy} disabled={!draft.title.trim()} onClick={createFree}>追加</Button>
        </div>
        {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '8px 0 0' }}>{err}</p>}
      </div>
      {freeTemplates.length === 0 ? (
        <EmptyState title="自由送信用テンプレートはまだありません" compact />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {freeTemplates.map(t => (
            <div key={t.id} className="ui-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 800 }}>{t.title}<span style={{ marginLeft: 8, fontSize: '.5rem', fontWeight: 800, color: 'var(--c-blue)', background: 'var(--c-ghost-bg)', borderRadius: 5, padding: '2px 6px' }}>{chLabel(t.channel)}</span></div>
                {t.body && <div style={{ fontSize: '.68rem', color: 'var(--muted2)', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.body}</div>}
              </div>
              <Button variant="danger" size="sm" busy={busy} onClick={() => removeFree(t.id)}>削除</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
