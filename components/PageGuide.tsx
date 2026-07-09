'use client'
/**
 * PageGuide — コンソール各ページの「見方・意味・主要操作」を需要時（ⓘ押下時）だけ出す共通ガイド。
 * 静音化原則：常設説明文は増やさず、ⓘを押した時だけモーダル（モバイルは全画面シート）で現れる。
 * 文法は案件ボードの既存ⓘ／マトリクスモーダルを踏襲・一般化（見出し横のⓘ→中央カード＋overlay）。
 * 内容はコード定数（PageGuideData）としてページとセットで進化させる。純プレゼンテーション。
 */
import { useState, type ReactNode } from 'react'
import Link from 'next/link'

export type GuideSection = { h: string; items: (string | { b: string; t: string })[] }
export type GuideNote = { t: string; href?: string; label?: string }
export type PageGuideData = {
  title: string
  lead: string
  sections?: GuideSection[]
  notes?: GuideNote[]
}

const CSS = `
.pg-ov{position:fixed;inset:0;background:rgba(14,14,20,.3);z-index:200;animation:pgFade .16s ease;}
.pg-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:var(--pgw,560px);max-width:94vw;max-height:86vh;overflow-y:auto;background:#fff;border-radius:16px;z-index:201;box-shadow:0 24px 60px rgba(14,14,20,.22);padding:22px 24px;animation:pgPop .2s cubic-bezier(.22,1,.36,1);}
.pg-head{display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff;}
.pg-title{font-size:.92rem;font-weight:700;}
.pg-x{background:none;border:none;cursor:pointer;color:var(--muted);font-size:1rem;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.pg-x:hover{background:var(--bg2);}
.pg-lead{font-size:.68rem;color:var(--muted2);margin-top:5px;line-height:1.6;}
.pg-sec{margin-top:16px;}
.pg-sec-h{font-size:.66rem;font-weight:700;letter-spacing:.02em;color:var(--txt);margin-bottom:7px;}
.pg-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
.pg-li{position:relative;padding-left:14px;font-size:.7rem;line-height:1.65;color:var(--t-secondary,#54506e);}
.pg-li::before{content:'';position:absolute;left:2px;top:.55em;width:4px;height:4px;border-radius:50%;background:var(--c-blue);opacity:.5;}
.pg-li b{color:var(--txt);font-weight:700;}
.pg-note{font-size:.64rem;color:var(--muted2);margin-top:10px;line-height:1.7;}
.pg-link{color:var(--c-blue);text-decoration:underline;text-underline-offset:3px;}
@keyframes pgFade{from{opacity:0}to{opacity:1}}
@keyframes pgPop{from{opacity:0;transform:translate(-50%,-46%) scale(.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@media (max-width:560px){
  .pg-modal{top:0;left:0;transform:none;width:100%;max-width:100%;height:100dvh;max-height:100dvh;border-radius:0;padding:calc(16px + env(safe-area-inset-top)) 18px 24px;animation:pgSheet .24s cubic-bezier(.22,1,.36,1);}
  .pg-head{padding-bottom:6px;}
}
@keyframes pgSheet{from{transform:translateY(100%)}to{transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){.pg-ov,.pg-modal{animation:none!important}}
`

function GuideBody({ data, children }: { data: PageGuideData; children?: ReactNode }) {
  return (
    <>
      <p className="pg-lead">{data.lead}</p>
      {data.sections?.map((s, i) => (
        <div className="pg-sec" key={i}>
          <div className="pg-sec-h">{s.h}</div>
          <ul className="pg-list">
            {s.items.map((it, j) => (
              <li className="pg-li" key={j}>{typeof it === 'string' ? it : <><b>{it.b}</b>：{it.t}</>}</li>
            ))}
          </ul>
        </div>
      ))}
      {children}
      {data.notes?.map((n, i) => (
        <p className="pg-note" key={i}>{n.t}{n.href && <> <Link href={n.href} className="pg-link">{n.label}</Link></>}</p>
      ))}
    </>
  )
}

export default function PageGuide({ data, width = 560, children }: { data: PageGuideData; width?: number; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} title="このページの見方" aria-label={`${data.title}を開く`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="7.6" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <>
          <style>{CSS}</style>
          <div className="pg-ov" onClick={() => setOpen(false)} />
          <div className="pg-modal" style={{ ['--pgw' as string]: `${width}px` }} role="dialog" aria-modal="true" aria-label={data.title}>
            <div className="pg-head">
              <b className="pg-title">{data.title}</b>
              <button className="pg-x" onClick={() => setOpen(false)} aria-label="閉じる">✕</button>
            </div>
            <GuideBody data={data}>{children}</GuideBody>
          </div>
        </>
      )}
    </>
  )
}
