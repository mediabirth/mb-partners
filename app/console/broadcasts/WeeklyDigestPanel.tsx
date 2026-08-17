'use client'
import { useEffect, useState } from 'react'

type DigestData = {
  enabled: boolean
  preview: { total: number; segments: { new: number; active: number; quiet: number } }
  samples: { segment: string; label: string; subject: string; text: string }[]
  history: { week: string; sent: number; stopped: number }[]
}

const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14 }

export default function WeeklyDigestPanel() {
  const [data, setData] = useState<DigestData | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  function load() {
    fetch('/api/console/weekly-digest', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? '確認できませんでした')
        setData(body)
      })
      .catch(e => setError(e instanceof Error ? e.message : '確認できませんでした'))
  }

  useEffect(load, [])

  async function toggle() {
    if (!data || pending) return
    const next = !data.enabled
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/console/weekly-digest', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }),
      })
      if (!response.ok) throw new Error('保存できませんでした')
      setData(current => current ? { ...current, enabled: next } : current)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした')
    } finally {
      setPending(false)
    }
  }

  return (
    <section data-weekly-digest style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
        <div>
          <h2 style={{ fontSize: '.9rem', fontWeight: 500, margin: 0 }}>週次ダイジェスト</h2>
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '4px 0 0' }}>毎週金曜 11:00</p>
        </div>
        <button
          type="button" role="switch" aria-checked={data?.enabled ?? false} aria-label="週次ダイジェストを配信"
          onClick={toggle} disabled={!data || pending}
          style={{ minWidth: 86, minHeight: 44, border: 0, borderRadius: 22, padding: '0 14px', fontSize: '.68rem', fontWeight: 500, cursor: !data || pending ? 'wait' : 'pointer', color: data?.enabled ? '#fff' : 'var(--muted2)', background: data?.enabled ? 'var(--c-blue)' : 'var(--bg)', opacity: pending ? .65 : 1 }}
        >
          {data?.enabled ? '配信中' : '停止中'}
        </button>
      </div>

      {error && <p aria-live="polite" style={{ ...CARD, margin: '0 0 10px', padding: 12, fontSize: '.68rem', color: 'var(--red)' }}>{error}</p>}
      {!data && !error && <div className="ui-skeleton" style={{ height: 160, borderRadius: 14 }} />}
      {data && (
        <>
          <div style={{ ...CARD, padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
              <Metric label="次回の対象" value={`${data.preview.total}名`} />
              <Metric label="新規未紹介" value={`${data.preview.segments.new}名`} />
              <Metric label="進行中あり" value={`${data.preview.segments.active}名`} />
              <Metric label="しばらく静か" value={`${data.preview.segments.quiet}名`} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 10, marginBottom: 10 }}>
            {data.samples.map(sample => (
              <details key={sample.segment} style={{ ...CARD, padding: '12px 14px' }}>
                <summary style={{ cursor: 'pointer', minHeight: 32, fontSize: '.72rem', fontWeight: 500 }}>{sample.label}の文面</summary>
                <p style={{ fontSize: '.66rem', fontWeight: 500, margin: '10px 0 6px' }}>{sample.subject}</p>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '.62rem', lineHeight: 1.7, color: 'var(--muted2)', margin: 0 }}>{sample.text}</pre>
              </details>
            ))}
          </div>

          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', fontSize: '.68rem', fontWeight: 500, borderBottom: '0.5px solid var(--line)' }}>配信履歴</div>
            {data.history.length === 0 ? (
              <p style={{ margin: 0, padding: '13px 14px', fontSize: '.66rem', color: 'var(--muted2)' }}>まだ配信していません。</p>
            ) : data.history.map(row => (
              <div key={row.week} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 14px', borderBottom: '0.5px solid var(--line)', fontSize: '.66rem' }}>
                <span style={{ fontFamily: 'Inter' }}>{row.week}</span>
                <span>送信 {row.sent}名 ・ 停止 {row.stopped}名</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '11px 12px', minWidth: 0 }}>
      <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginBottom: 3 }}>{label}</div>
      <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 500 }}>{value}</div>
    </div>
  )
}
