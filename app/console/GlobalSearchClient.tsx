'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Result = {
  type: 'deal' | 'partner' | 'service' | 'inquiry'
  id: string
  label: string
  sub: string
  href: string
}

const TYPE_LABEL: Record<Result['type'], string> = {
  deal:    '案件',
  partner: 'パートナー',
  service: 'サービス',
  inquiry: '問い合わせ',
}
const TYPE_COLORS: Record<Result['type'], { bg: string; txt: string }> = {
  deal:    { bg: 'var(--blue-bg)',   txt: 'var(--blue)'  },
  partner: { bg: 'var(--green-bg)',  txt: 'var(--green)' },
  service: { bg: 'var(--amber-bg)',  txt: 'var(--amber)' },
  inquiry: { bg: 'var(--red-bg)',    txt: 'var(--red)'   },
}

export default function GlobalSearchClient() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)
  const router                = useRouter()
  const timer                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/console/search?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 280)
  }, [query])

  function pick(r: Result) {
    setQuery('')
    setOpen(false)
    router.push(r.href)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', border: '1.5px solid var(--line)', borderRadius: 9, padding: '7px 12px', width: 280 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="検索（案件・パートナー・サービス・問い合わせ）"
          style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', fontSize: '.74rem', color: 'var(--txt)', flex: 1 }}
        />
        {loading && (
          <span style={{ width: 12, height: 12, border: '2px solid var(--line)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 11,
          boxShadow: '0 12px 32px rgba(14,14,20,.12)', width: 300, zIndex: 60,
          overflow: 'hidden',
        }}>
          {results.map(r => (
            <div
              key={r.id}
              onMouseDown={() => pick(r)}
              style={{ display: 'flex', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F2F2F6', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: TYPE_COLORS[r.type].bg, color: TYPE_COLORS[r.type].txt, flexShrink: 0 }}>
                {TYPE_LABEL[r.type]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#fff', border: '1px solid var(--line)', borderRadius: 11, boxShadow: '0 12px 32px rgba(14,14,20,.12)', width: 260, zIndex: 60, padding: '14px', fontSize: '.72rem', color: 'var(--muted2)', textAlign: 'center' }}>
          「{query}」の結果なし
        </div>
      )}
    </div>
  )
}
