'use client'
/**
 * 磨き③（改善）: 案件一覧の検索。refer には検索があるのに案件一覧には無く、
 * 件数が増えると探せない不足への回答。サーバ描画のカードに付与された
 * data-case-search（正規化済み文字列）をクライアント側で絞り込む（データ取得は非接触）。
 */
import { useEffect, useRef, useState } from 'react'

function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

export default function CasesSearch({ total }: { total: number }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(total)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = boxRef.current?.closest('.page-anim') ?? document
    const cards = root.querySelectorAll<HTMLElement>('[data-case-search]')
    const nq = norm(q)
    let n = 0
    cards.forEach(c => {
      const hit = !nq || (c.dataset.caseSearch ?? '').includes(nq)
      c.style.display = hit ? '' : 'none'
      if (hit) n++
    })
    setHits(n)
  }, [q])

  if (total < 6) return null   // 少件数のうちはノイズになるため出さない

  return (
    <div ref={boxRef} style={{ margin: '0 20px 12px' }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="お客さま名・メニューで検索"
        aria-label="案件を検索"
        style={{ width: '100%', border: '0.5px solid var(--line)', borderRadius: 10, padding: '10px 13px', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: 'var(--txt)' }}
      />
      {q && <p style={{ fontSize: 11, color: 'var(--muted2)', margin: '6px 2px 0' }}>{hits}件が一致</p>}
    </div>
  )
}
