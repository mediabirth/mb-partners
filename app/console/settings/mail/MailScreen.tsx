'use client'
/**
 * メール管理画面（磨き①）。運営が「何が・いつ・誰に・どんな体裁で」送られるかを完全に掌握する。
 * - マトリクス: イベント × 宛先の全体像
 * - テンプレ: 一覧（既定/カスタム/無効）→ 右で編集（件名・本文・有効）＋実データ風サンプルのライブプレビュー
 * - 履歴: mail_log 最新200件
 * v2.2: 0.5px罫線・weight400/500・塗りなし・ドット+テキスト。
 */
import { useEffect, useMemo, useState } from 'react'
import PageGuide from '@/components/PageGuide'
import { GUIDE_MAIL } from '@/lib/console-guides'
import { MAIL_REGISTRY, MAIL_REGISTRY_BY_KEY, fillVars, sampleVars, mailMatrix, type MailTemplateDef } from '@/lib/mail-registry'
import { bodyToBrandedHtml } from '@/lib/mail-render'

type Override = { id: string; subject: string | null; body: string | null; is_active: boolean; updated_at: string }
type LogRow = { id: number; template_key: string | null; event: string | null; to_email: string; to_role: string | null; subject: string; status: string; detail: string | null; created_at: string }

const LINE = '0.5px solid var(--line)'
const AUDIENCE_LABEL: Record<string, string> = { partner: 'パートナー', customer: 'お客さま', vendor: '委託先', invitee: '招待先', ops: '運営' }
const STATUS_DOT: Record<string, string> = { sent: 'var(--green)', skipped: 'var(--muted)', error: 'var(--red)' }
const STATUS_LABEL: Record<string, string> = { sent: '送信', skipped: 'スキップ', error: 'エラー' }

const fmtJST = (iso: string) => new Date(iso).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

export default function MailScreen() {
  const [tab, setTab] = useState<'templates' | 'matrix' | 'log'>('templates')
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [logs, setLogs] = useState<LogRow[]>([])
  const [selKey, setSelKey] = useState<string>(MAIL_REGISTRY[0].key)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [active, setActive] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)

  const def = MAIL_REGISTRY_BY_KEY[selKey]
  const ov = overrides[selKey]

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2400) }

  async function reload() {
    const r = await fetch('/api/console/mail')
    const d = await r.json().catch(() => ({}))
    setOverrides(d.overrides ?? {})
    setLogs(d.logs ?? [])
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  // 選択切替時に編集値をロード（カスタムがあればそれ、無ければ既定）
  useEffect(() => {
    const o = overrides[selKey]
    setSubject(o?.subject ?? def.defaultSubject)
    setBody(o?.body ?? def.defaultBody)
    setActive(o ? o.is_active : true)
    setDirty(false)
  }, [selKey, overrides]) // eslint-disable-line react-hooks/exhaustive-deps

  const vars = useMemo(() => sampleVars(def), [def])
  const previewSubject = fillVars(subject || def.defaultSubject, vars)
  const previewButtons = (def.buttons ?? []).map(b => ({ label: b.label, url: String(vars[b.urlVar] ?? 'https://mb-partners.app') }))
  const previewHtml = useMemo(
    () => bodyToBrandedHtml(fillVars(body || def.defaultBody, vars), previewButtons),
    [body, def, vars] // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function save() {
    setBusy(true)
    try {
      const r = await fetch('/api/console/mail/template', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: selKey, subject, body, is_active: active }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showToast(d.error ?? '保存できませんでした。時間をおいて再度お試しください'); return }
      showToast('保存しました')
      await reload()
    } finally { setBusy(false) }
  }

  async function resetToDefault() {
    setBusy(true)
    try {
      const r = await fetch(`/api/console/mail/template?key=${encodeURIComponent(selKey)}`, { method: 'DELETE' })
      if (!r.ok) { showToast('既定に戻せませんでした。時間をおいて再度お試しください'); return }
      showToast('既定の文面に戻しました')
      await reload()
    } finally { setBusy(false) }
  }

  const events = useMemo(() => [...new Set(MAIL_REGISTRY.map(d => d.event))], [])
  const matrix = useMemo(() => mailMatrix(), [])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>メール</h1><PageGuide data={GUIDE_MAIL} /></span>
        <a href="/console/settings" style={{ fontSize: '.68rem', color: 'var(--muted2)', textDecoration: 'none' }}>← 設定</a>
      </div>
      <p style={{ fontSize: '.7rem', color: 'var(--muted2)', margin: '0 0 16px' }}>
        自動送信メールの全体像・文面・送信履歴。文面を編集するとコード既定より優先されます。
      </p>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, borderBottom: LINE, marginBottom: 18 }}>
        {([['templates', 'テンプレート'], ['matrix', '送信マトリクス'], ['log', '送信履歴']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer', padding: '8px 14px', fontSize: '.74rem', fontWeight: 500, color: tab === k ? 'var(--txt)' : 'var(--muted2)', borderBottom: tab === k ? '2px solid var(--txt)' : '2px solid transparent', marginBottom: -1 }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'matrix' && (
        <div style={{ background: '#fff', border: LINE, borderRadius: 14, overflow: 'hidden' }}>
          {/* 通水P3「循環」: 自動送信の実配線ドライラン。どのイベントで・誰に・いつ飛ぶかの全体像＝この画面からは送信されません。 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderBottom: LINE, background: 'var(--blue-bg)' }}>
            <span style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--c-blue)', border: '0.5px solid var(--c-blue)', borderRadius: 20, padding: '1px 8px' }}>ドライラン</span>
            <span style={{ fontSize: '.64rem', color: 'var(--muted2)', lineHeight: 1.5 }}>
              自動送信の実配線です（{matrix.length}イベント／{MAIL_REGISTRY.length}通）。この画面からは送信されません。各イベントの「いつ」は下に記載。
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.4fr 1fr 1fr', padding: '9px 18px', borderBottom: LINE, background: 'var(--bg2)' }}>
            {['イベント', 'パートナー', 'お客さま', '委託先', '招待先'].map(h => (
              <span key={h} style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.06em' }}>{h}</span>
            ))}
          </div>
          {matrix.map(row => (
            <div key={row.event} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.4fr 1fr 1fr', padding: '11px 18px', borderBottom: LINE, fontSize: '.72rem', alignItems: 'start' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontWeight: 500 }}>{row.event}</span>
                <span style={{ fontSize: '.56rem', color: 'var(--muted)', lineHeight: 1.4 }}>{MAIL_REGISTRY.find(d => d.event === row.event)?.trigger ?? ''}</span>
              </span>
              {(['partner', 'customer', 'vendor', 'invitee'] as const).map(aud => (
                <span key={aud} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {row[aud].length === 0 ? <span style={{ color: 'var(--muted)' }}>—</span> : row[aud].map(k => (
                    <button key={k} onClick={() => { setSelKey(k); setTab('templates') }}
                      style={{ border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left', fontSize: '.7rem', color: 'var(--c-blue)' }}>
                      {MAIL_REGISTRY_BY_KEY[k].name}
                      {overrides[k] && <span style={{ marginLeft: 6, fontSize: '.58rem', color: overrides[k].is_active ? 'var(--green)' : 'var(--muted)' }}>{overrides[k].is_active ? 'カスタム' : '無効'}</span>}
                    </button>
                  ))}
                </span>
              ))}
            </div>
          ))}
          <p style={{ fontSize: '.62rem', color: 'var(--muted2)', padding: '10px 18px', margin: 0 }}>
            運営宛の内部通知（新規案件・ステータス変更・成約・口座変更・支払確定など）はテンプレ管理の対象外です。送信履歴には記録されます。
          </p>
        </div>
      )}

      {tab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
          {/* 左: 一覧（イベント別グループ） */}
          <div style={{ background: '#fff', border: LINE, borderRadius: 14, overflow: 'hidden' }}>
            {events.map(ev => (
              <div key={ev}>
                <div style={{ padding: '8px 14px 4px', fontSize: '.58rem', color: 'var(--muted2)', letterSpacing: '.06em', background: 'var(--bg2)', borderBottom: LINE }}>{ev}</div>
                {MAIL_REGISTRY.filter(d => d.event === ev).map(d => {
                  const o = overrides[d.key]
                  const sel = d.key === selKey
                  return (
                    <button key={d.key} onClick={() => setSelKey(d.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', borderBottom: LINE, background: sel ? 'var(--bg2)' : 'none', fontFamily: 'inherit', cursor: 'pointer', padding: '10px 14px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: o ? (o.is_active ? 'var(--green)' : 'var(--muted)') : 'var(--line)' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                        <span style={{ display: 'block', fontSize: '.56rem', color: 'var(--muted2)' }}>{AUDIENCE_LABEL[d.audience]}宛 ・ {o ? (o.is_active ? 'カスタム' : '無効化中') : '既定'}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* 右: 編集＋プレビュー */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ background: '#fff', border: LINE, borderRadius: 14, padding: '18px 18px' }}>
              <div style={{ marginBottom: 4, fontSize: '.82rem', fontWeight: 500 }}>{def.name}</div>
              <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>{def.trigger}（{AUDIENCE_LABEL[def.audience]}宛）</p>

              <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>件名</label>
              <input value={subject} onChange={e => { setSubject(e.target.value); setDirty(true) }}
                style={{ width: '100%', border: LINE, borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.78rem', marginBottom: 12 }} />

              <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>本文</label>
              <textarea value={body} onChange={e => { setBody(e.target.value); setDirty(true) }} rows={12}
                style={{ width: '100%', border: LINE, borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.76rem', lineHeight: 1.7, resize: 'vertical', marginBottom: 8 }} />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {def.vars.map(v => (
                  <button key={v.key} type="button" title={`${v.label}（例：${v.sample}）`}
                    onClick={() => { setBody(b => b + '${' + v.key + '}'); setDirty(true) }}
                    style={{ border: LINE, background: 'var(--bg2)', borderRadius: 20, padding: '2px 9px', fontSize: '.6rem', fontFamily: 'Inter, monospace', color: 'var(--muted2)', cursor: 'pointer' }}>
                    {'${' + v.key + '}'}
                  </button>
                ))}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.7rem', marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={active} onChange={e => { setActive(e.target.checked); setDirty(true) }} style={{ accentColor: 'var(--c-blue)' }} />
                この文面を有効にする（オフで既定文面に戻ります）
              </label>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={save} disabled={busy || !dirty} className="ui-btn ui-btn--primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {busy ? '保存中…' : '保存する'}
                </button>
                {ov && (
                  <button onClick={resetToDefault} disabled={busy} className="ui-btn ui-btn--secondary" style={{ flexShrink: 0 }}>
                    既定に戻す
                  </button>
                )}
              </div>
              {ov && <p style={{ fontSize: '.58rem', color: 'var(--muted)', margin: '10px 0 0' }}>カスタム文面 ・ 最終更新 {fmtJST(ov.updated_at)}</p>}
            </div>

            {/* プレビュー（実データ風サンプル差し込み） */}
            <div style={{ background: '#fff', border: LINE, borderRadius: 14, padding: '18px 18px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 8 }}>プレビュー（サンプル差し込み）</div>
              <div style={{ fontSize: '.74rem', fontWeight: 500, padding: '9px 12px', background: 'var(--bg2)', borderRadius: 9, marginBottom: 10, overflowWrap: 'anywhere' }}>{previewSubject}</div>
              <iframe title="メールプレビュー" sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:14px;background:#EDEDF1">${previewHtml}</body>`}
                style={{ width: '100%', height: 460, border: LINE, borderRadius: 10, background: '#EDEDF1' }} />
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div style={{ background: '#fff', border: LINE, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '.8fr .9fr 1.6fr .7fr 2fr .7fr', padding: '9px 18px', borderBottom: LINE, background: 'var(--bg2)' }}>
            {['日時', 'イベント', '宛先', '種別', '件名', '結果'].map(h => (
              <span key={h} style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.06em' }}>{h}</span>
            ))}
          </div>
          {loading ? (
            <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 18px' }}>読み込み中…</p>
          ) : logs.length === 0 ? (
            <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 18px' }}>まだ送信履歴はありません。メールが送られるとここに記録されます。</p>
          ) : logs.map(l => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '.8fr .9fr 1.6fr .7fr 2fr .7fr', padding: '10px 18px', borderBottom: LINE, fontSize: '.68rem', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Inter', color: 'var(--muted2)' }}>{fmtJST(l.created_at)}</span>
              <span>{l.event ?? (l.template_key ? MAIL_REGISTRY_BY_KEY[l.template_key]?.event : '—') ?? '—'}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.to_email}</span>
              <span style={{ color: 'var(--muted2)' }}>{AUDIENCE_LABEL[l.to_role ?? ''] ?? l.to_role ?? '—'}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.detail ?? undefined}>{l.subject}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[l.status] ?? 'var(--muted)' }} />
                {STATUS_LABEL[l.status] ?? l.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: `translateX(-50%) translateY(${toast ? 0 : 12}px)`, background: 'var(--txt)', color: '#fff', padding: '11px 20px', borderRadius: 9, fontSize: '.72rem', fontWeight: 500, opacity: toast ? 1 : 0, pointerEvents: 'none', transition: 'all .2s', zIndex: 130 }}>
        {toast}
      </div>
    </div>
  )
}
