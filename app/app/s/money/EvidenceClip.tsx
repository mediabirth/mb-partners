'use client'
/** 請求行の売上エビデンス参照（ベンダー純化P2）— 📎クリックで60秒署名URLを開く（バケット非公開のまま）。 */
export default function EvidenceClip({ evidences }: { evidences: { id: string; label: string | null }[] }) {
  if (!evidences.length) return null
  async function view(id: string) {
    const r = await fetch(`/api/supplier/evidence?id=${id}`)
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.url) window.open(j.url, '_blank', 'noopener')
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
      {evidences.map(ev => (
        <button key={ev.id} onClick={() => view(ev.id)} title={ev.label ?? 'エビデンスを開く'} aria-label={`エビデンスを開く（${ev.label ?? '添付'}）`}
          style={{ background: 'none', border: 'none', padding: '2px 2px', cursor: 'pointer', color: 'var(--muted2)', display: 'inline-flex' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.4 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.2-9.19a4 4 0 015.65 5.66l-9.2 9.19a2 2 0 01-2.82-2.83l8.49-8.48" /></svg>
        </button>
      ))}
    </span>
  )
}
