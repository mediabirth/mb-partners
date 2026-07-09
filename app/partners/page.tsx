'use client'
/**
 * パートナー募集LP v8 — 光のネットワークCGの雰囲気はそのまま、情報構成を復活。
 * 構成: HERO → 数字(実績) → 3ステップ → 報酬(名称のみ) → スマホで完結 → 応募。領域の星座図は廃止(今後増えるため)。
 * 数字: 領域=6は実値。パートナー数/累計お支払いは仮値(勝彦承認 2026-07-07・STATS定数で差替可)。創作数字は景表法配慮でmodest。
 * 応募は既存 /api/partner-apply(partner_applications)。会社表記「株式会社Media Birth」。ページスコープ(three は /partners のみ動的import)。
 */
import { useEffect, useRef, useState } from 'react'
import { useNetwork, useMotion, useInteractions } from './scene'

// ── 数字セクション。field=6は実値(services active)。partner/fee は仮値＝実データに差し替え可。 ──
// fee は K表記(千円単位)。to=3200 → "3,200K"（＝¥3,200,000相当）。
const STATS: { key: string; to: number; prefix?: string; suffix?: string; label: string; real?: boolean }[] = [
  { key: 'field', to: 12, prefix: '+', label: 'field', real: true },
  { key: 'partner', to: 40, prefix: '+', label: 'partner' },
  { key: 'fee', to: 3200, prefix: '+', suffix: 'K', label: 'fee' },
]

// ステップ用「動くオブジェクト」＝グラスタイル内で動くアイコン(つなげる/はなす/もたらす)
const STEP_GLYPH: Record<string, React.ReactNode> = {
  connect: <svg viewBox="0 0 56 56" fill="none"><circle cx="16" cy="28" r="6.5" className="pg-node" /><circle cx="40" cy="28" r="6.5" className="pg-node" /><line x1="22.5" y1="28" x2="33.5" y2="28" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".5" /><circle cx="22.5" cy="28" r="3" fill="currentColor" className="pg-travel" /></svg>,
  talk: <svg viewBox="0 0 56 56" fill="none"><path d="M13 19h26a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5H24l-8 6v-6a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5z" fill="currentColor" opacity=".16" stroke="currentColor" strokeWidth="2.2" className="pg-bubble" /><circle cx="21" cy="27.5" r="1.9" fill="currentColor" /><circle cx="27" cy="27.5" r="1.9" fill="currentColor" className="pg-blink" /><circle cx="33" cy="27.5" r="1.9" fill="currentColor" /></svg>,
  bring: <svg viewBox="0 0 56 56" fill="none"><rect x="15.5" y="28" width="25" height="15" rx="2.6" fill="currentColor" opacity=".16" stroke="currentColor" strokeWidth="2.4" /><line x1="28" y1="30" x2="28" y2="43" stroke="currentColor" strokeWidth="2.4" /><g className="pg-lid"><rect x="12.5" y="21.5" width="31" height="8.5" rx="2.6" fill="currentColor" opacity=".26" stroke="currentColor" strokeWidth="2.4" /><path d="M28 21.5c0-5.5-7-6.6-7-2.4 0 3 4.2 3.4 7 2.4zM28 21.5c0-5.5 7-6.6 7-2.4 0 3-4.2 3.4-7 2.4z" fill="currentColor" opacity=".32" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></g><path d="M45 13.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" className="pg-spark" /></svg>,
}
// 報酬用フラットイラスト(固定/成果/継続) — スマホ図と同じ分かりやすさ
const REWARD_ILLUS: Record<string, React.ReactNode> = {
  fixed: <svg viewBox="0 0 88 88" fill="none"><ellipse cx="44" cy="55" rx="22" ry="6" fill="currentColor" opacity=".12" /><g className="ri-coin"><circle cx="44" cy="40" r="21" fill="currentColor" opacity=".16" /><circle cx="44" cy="40" r="21" stroke="currentColor" strokeWidth="3" /><path d="M44 31v18M37 37l7 5 7-5M38 43h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g></svg>,
  perf: <svg viewBox="0 0 88 88" fill="none"><rect className="ri-bar rb1" x="20" y="50" width="12" height="18" rx="3" fill="currentColor" opacity=".3" /><rect className="ri-bar rb2" x="38" y="40" width="12" height="28" rx="3" fill="currentColor" opacity=".52" /><rect className="ri-bar rb3" x="56" y="28" width="12" height="40" rx="3" fill="currentColor" /><path d="M22 40l16-10 12 6 18-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M62 20h8v8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  recur: <svg viewBox="0 0 88 88" fill="none"><circle cx="44" cy="44" r="20" fill="currentColor" opacity=".14" /><g className="ri-cyc"><path d="M60 38a18 18 0 1 0 1.5 11" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /><path d="M61 26v13H48" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></g><circle cx="44" cy="44" r="4.5" fill="currentColor" /></svg>,
}

// field：業種（動くオブジェクト＋名称）。実領域カテゴリ＝拡大前提。
const FIELDS = [
  { key: 'brand', n: 'ブランディング', c: '#8b5cf6' },
  { key: 'design', n: 'デザイン', c: '#ec4899' },
  { key: 'web', n: 'Web制作', c: '#4733e6' },
  { key: 'video', n: '映像', c: '#f2971b' },
  { key: 'dev', n: 'システム開発', c: '#15917e' },
  { key: 'ops', n: '業務設計', c: '#6d5cf5' },
  { key: 'dx', n: 'DX導入', c: '#1e9e6a' },
  { key: 'bpo', n: 'BPO', c: '#8b5cf6' },
  { key: 'hr', n: '人材・採用', c: '#1e9e6a' },
  { key: 'growth', n: 'グロース', c: '#ec4899' },
  { key: 'estate', n: '不動産', c: '#4733e6' },
  { key: 'enta', n: 'エンタメ', c: '#ff5a8a' },
]
const FIELD_GLYPH: Record<string, React.ReactNode> = {
  brand: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M24 8l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="currentColor" fillOpacity="0.16" /></svg>,
  design: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 35l3-8L32 11l5 5-16 16-8 3z" fill="currentColor" fillOpacity="0.14" /><path d="M28 15l5 5" /></svg>,
  web: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="11" width="32" height="26" rx="3" fill="currentColor" fillOpacity="0.13" /><path d="M8 18h32" /><circle cx="13" cy="14.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="17.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" /></svg>,
  video: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="12" width="32" height="24" rx="4" fill="currentColor" fillOpacity="0.13" /><path d="M21 19.5l8.5 4.5-8.5 4.5z" fill="currentColor" stroke="none" /></svg>,
  dev: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="11" width="32" height="26" rx="4" fill="currentColor" fillOpacity="0.12" /><path d="M19 20l-5 4 5 4M29 20l5 4-5 4" /></svg>,
  ops: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="7.5" fill="currentColor" fillOpacity="0.16" /><circle cx="24" cy="24" r="7.5" /><path d="M24 10v5M24 33v5M38 24h-5M10 24h5" /></svg>,
  dx: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="14" y="14" width="20" height="20" rx="3" fill="currentColor" fillOpacity="0.16" /><path d="M20 10v4M28 10v4M20 34v4M28 34v4M10 20h4M10 28h4M34 20h4M34 28h4" /></svg>,
  bpo: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="10" y="13" width="15" height="15" rx="3" fill="currentColor" fillOpacity="0.14" /><path d="M31 17a9 9 0 1 0 3 8" /><path d="M31 11v6h-6" /></svg>,
  hr: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="5" fill="currentColor" fillOpacity="0.18" /><circle cx="31" cy="20" r="4.3" fill="currentColor" fillOpacity="0.18" /><path d="M9 37c1-6 5-9 9-9s8 3 9 9" /><path d="M27 35c1-5 4-7.5 7-7.5s6 2.5 7 7.5" /></svg>,
  growth: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 33l9-8 6 5 13-13" /><path d="M32 17h6v6" /><path d="M10 38h29" opacity="0.35" /></svg>,
  estate: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 21v15h22V21" fill="currentColor" fillOpacity="0.13" /><path d="M9 23L24 10l15 13" /><path d="M20 36v-8h8v8" fill="currentColor" fillOpacity="0.3" /></svg>,
  enta: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="20" y="8" width="8" height="18" rx="4" fill="currentColor" fillOpacity="0.16" /><path d="M15 22a9 9 0 0 0 18 0" /><path d="M24 31v6M19 37h10" /></svg>,
}

// MBプロダクト（横スクロール・実ブランド配色）
const PRODUCTS: { n: string; c: string; logo?: string }[] = [
  { n: 'MOOM', c: '#4733e6', logo: '/logos/moom.svg' },
  { n: 'MatchHub', c: '#1e9e6a', logo: '/logos/matchhub.svg' },
  { n: 'RESONATION', c: '#8b5cf6', logo: '/logos/resonation.svg' },
  { n: 'PRAGMATION', c: '#15917e' },
  { n: 'EMANATION', c: '#6d5cf5' },
  { n: 'ENTERSOLOGY', c: '#ec4899', logo: '/logos/entersology.svg' },
]

// こんな方へ（パートナー像・動くアイコン）
// FAQ（事実の正典・収入保証や創作数字なし）
const FAQ = [
  { q: 'どんな方に向いていますか？', a: '人とのつながりが多い方に向いています。士業・経営者・営業職など、ご紹介の機会が多い方におすすめです。' },
  { q: '費用はかかりますか？', a: '登録は無料です。審査のうえ、ご案内します。' },
  { q: '何を紹介すればいいですか？', a: '不動産・人材・制作・DXなど、お困りごとをお持ちの方をおつなぎいただくだけです。' },
  { q: '手間はかかりますか？', a: 'ご紹介いただくだけ。商談も実務も、すべて当社が対応します。' },
  { q: '報酬はどう決まりますか？', a: '固定・成果連動・継続の3タイプがあります。内容はメニューにより異なります。' },
]

// 安心して紹介できる理由（動くアイコン・枠なし）
const REASONS = [
  { key: 'secure', n: '情報は厳重に管理', d: 'いただいた情報は、ご案内のためだけに使用します。', c: '#4733e6' },
  { key: 'nospam', n: 'しつこい連絡なし', d: '必要な範囲でご案内。無理な営業はいたしません。', c: '#1e9e6a' },
  { key: 'wedo', n: '実務はすべて当社', d: '商談も対応も当社が担当。あなたはつなぐだけ。', c: '#8b5cf6' },
]
const REASON_GLYPH: Record<string, React.ReactNode> = {
  secure: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M24 8l13 5v9c0 8.5-5.5 14.5-13 17-7.5-2.5-13-8.5-13-17v-9z" fill="currentColor" fillOpacity="0.14" /><path d="M18 24l4.5 4.5L30 20" /></svg>,
  nospam: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20a8 8 0 0 1 15.5-2.8" /><path d="M34 24v6l3 4H11l3-4v-6" fill="currentColor" fillOpacity="0.12" /><path d="M20 38a4 4 0 0 0 8 0" /><path d="M10 10l28 28" /></svg>,
  wedo: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 27v-3a12 12 0 0 1 24 0v3" fill="currentColor" fillOpacity="0.1" /><rect x="9" y="26" width="6" height="10" rx="2" fill="currentColor" fillOpacity="0.22" /><rect x="33" y="26" width="6" height="10" rx="2" fill="currentColor" fillOpacity="0.22" /><path d="M36 36a6 6 0 0 1-6 5h-4" /></svg>,
}

// ── 生きた光のネットワーク(動的import・全面固定層・pointer-events:none) ──
function useCountUp(ref: React.RefObject<HTMLElement | null>, to: number, prefix = '', suffix = '', dur = 1700) {
  useEffect(() => {
    const el = ref.current; if (!el) return
    let started = false
    const run = () => {
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3)
        el.textContent = prefix + Math.round(to * e).toLocaleString('ja-JP') + suffix
        if (p < 1) requestAnimationFrame(step); else el.classList.add('plp-pop')
      }
      requestAnimationFrame(step)
    }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !started) { started = true; run(); io.disconnect() } }), { threshold: 0.5 })
    io.observe(el); return () => io.disconnect()
  }, [ref, to, prefix, suffix, dur])
}

function Kicker({ label }: { label: string }) {
  return <div className="plp-kicker" data-st><span className="plp-kicker-dot" aria-hidden />{label}</div>
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="plp-faq">
      {FAQ.map((f, i) => (
        <div key={i} className={`plp-faq-item${open === i ? ' open' : ''}`} data-st>
          <button className="plp-faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span>{f.q}</span><span className="plp-faq-chev" aria-hidden />
          </button>
          <div className="plp-faq-a"><p>{f.a}</p></div>
        </div>
      ))}
    </div>
  )
}

function Stat({ s }: { s: typeof STATS[number] }) {
  const ref = useRef<HTMLSpanElement>(null)
  useCountUp(ref, s.to, s.prefix ?? '', s.suffix ?? '')
  return (
    <div className="plp-stat" data-st>
      <span className="plp-statlab">{s.label}</span>
      <span className="plp-statnum" ref={ref}>{(s.prefix ?? '') + '0' + (s.suffix ?? '')}</span>
    </div>
  )
}

export default function PartnersLP() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const progRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  useNetwork(sceneRef)
  useMotion()
  useInteractions(progRef, glowRef)

  const [name, setName] = useState(''), [org, setOrg] = useState(''), [expertise, setExpertise] = useState('')
  const [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false)
  const [err, setErr] = useState(''), [done, setDone] = useState(false)
  const scrollForm = () => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) return setErr('お名前をご入力ください。')
    if (!email.trim()) return setErr('メールアドレスをご入力ください。')
    if (!consent) return setErr('ご案内の同意にチェックをお願いします。')
    setBusy(true)
    try {
      const r = await fetch('/api/partner-apply', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, org, expertise, email, phone, message, consent }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '送信に失敗しました。') }
      // 完了は専用ページへ（丁寧な受付＋期待感の演出）。応募完了メール＝面談予約リンクはサーバ側で送信済み。
      window.location.assign('/partners/thanks')
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : '送信に失敗しました。'); setBusy(false) }
  }

  const STEPS = [
    { key: 'connect', c: 'b1', t: 'つなげる', d: 'つながりをご紹介いただく' },
    { key: 'talk', c: 'b2', t: 'はなす', d: '当社が丁寧に対応します' },
    { key: 'bring', c: 'b3', t: 'もたらす', d: '成果をあなたに還元します' },
  ]
  const REWARDS = [
    { key: 'fixed', c: 'var(--indigo)', t: '固定', d: '成約ごとに' },
    { key: 'perf', c: 'var(--teal)', t: '成果', d: '成果に応じて' },
    { key: 'recur', c: 'var(--gold)', t: '継続', d: '毎月つづく' },
  ]

  return (
    <main className="plp">
      <style>{CSS}</style>
      <div className="plp-progress" ref={progRef} aria-hidden />
      <div className="plp-glow" ref={glowRef} aria-hidden />
      <div className="plp-field" aria-hidden />
      <div ref={sceneRef} className="plp-scene" aria-hidden />

      <header className="plp-hd on">
        <a className="plp-hd-logo" href="#top" aria-label="MB Partners">
          <svg viewBox="0 0 48 48" fill="none" aria-hidden><g stroke="#4733E6" strokeWidth="2.2" strokeLinecap="round" opacity="0.4"><line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" /></g><rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6" /><circle cx="39" cy="14" r="3.6" fill="#8B5CF6" /><rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" strokeWidth="2.4" /><circle cx="10" cy="37" r="4" fill="#4733E6" /><circle cx="8" cy="21" r="2.8" stroke="#4733E6" strokeWidth="2.4" /><rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6" /></svg>
          <b>MB<span> Partners</span></b>
        </a>
        <div className="plp-hd-actions">
          <a className="plp-hd-login" href="/app">ログイン</a>
          <button className="plp-hd-apply" onClick={scrollForm}>応募する</button>
        </div>
      </header>

      <div className="plp-content" id="top">
        {/* ── HERO ── */}
        <section className="plp-hero plp-io">
          <h1 className="plp-h1" data-st><span className="plp-h1l">あなたの<span className="plp-quote">「つながり」</span>が</span><span className="plp-h1l"><em>資産</em>になる。</span></h1>
          <div className="plp-cta-row" data-st>
            <button className="plp-cta" onClick={scrollForm}>パートナーに応募する<span className="plp-arrow">→</span></button>
          </div>
          <div className="plp-scrollcue" data-st aria-hidden><span /></div>
        </section>

        {/* ── 数字(実績)。field=6実値／partner・fee は仮値 ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <div className="plp-stats">
              {STATS.map(s => <Stat key={s.key} s={s} />)}
            </div>
          </div>
        </section>

        {/* ── field：領域belt（2段・逆スクロール・白タイル・広がりを表現） ── */}
        <section className="plp-sec plp-field-sec plp-io">
          <div className="plp-wrap"><h2 className="plp-h2" data-st>領域は、広がっていく。</h2></div>
          {[FIELDS, [...FIELDS.slice(3), ...FIELDS.slice(0, 3)]].map((row, ri) => (
            <div key={ri} className="plp-marquee plp-fmarquee" aria-hidden>
              <div className={`plp-mq-track plp-ftrack${ri ? ' plp-ftrack-r' : ''}`}>
                {Array.from({ length: 4 }).flatMap((_, r) => row.map(fl => (
                  <div key={`${ri}-${r}-${fl.key}`} className="plp-fmq" style={{ ['--fc' as string]: fl.c }}>
                    <span className={`plp-fobj fobj-${fl.key}`}>{FIELD_GLYPH[fl.key]}</span>
                    <span className="plp-fname">{fl.n}</span>
                  </div>
                )))}
              </div>
            </div>
          ))}
        </section>

        {/* ── 流れ：つなげる・はなす・もたらす(動くオブジェクト) ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <h2 className="plp-h2" data-st>シンプルな仕組み。</h2>
            <div className="plp-steps">
              <span className="plp-thread" aria-hidden />
              {STEPS.map(s => (
                <div key={s.key} className="plp-step" data-st>
                  <span className={`plp-step-obj ${s.c}`} aria-hidden>{STEP_GLYPH[s.key]}</span>
                  <h3 className="plp-step-t">{s.t}</h3>
                  <p className="plp-step-d">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── fee type：固定・成果・継続(動くフラットイラスト) ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <h2 className="plp-h2" data-st>報酬バリエーション。</h2>
            <div className="plp-rewards">
              {REWARDS.map(r => (
                <div key={r.key} className="plp-rw" data-st style={{ ['--rc' as string]: r.c }}>
                  <span className="plp-rw-card" aria-hidden>{REWARD_ILLUS[r.key]}</span>
                  <span className="plp-rw-t">{r.t}</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}><a className="plp-textlink" href="/partners/rewards" data-st>報酬の詳細を見る<span className="plp-arrow">→</span></a></div>
          </div>
        </section>

        {/* ── MBプロダクト（横スクロール・ずっと動く） ── */}
        <section className="plp-mq-sec plp-io">
          <div className="plp-marquee" aria-hidden>
            <div className="plp-mq-track">
              {[...PRODUCTS, ...PRODUCTS, ...PRODUCTS, ...PRODUCTS].map((p, i) => (
                p.logo
                  ? <span key={i} className="plp-mq-logo"><img src={p.logo} alt={p.n} /></span>
                  : <span key={i} className="plp-mq-item" style={{ ['--c' as string]: p.c }}>{p.n}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 安心して紹介できる理由（枠なしオブジェクト） ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <h2 className="plp-h2" data-st>安心して、紹介できる。</h2>
            <div className="plp-aud plp-reasons">
              {REASONS.map(r => (
                <div key={r.key} className="plp-audcard" data-st style={{ ['--fc' as string]: r.c }}>
                  <span className={`plp-aud-obj rgl-${r.key}`} aria-hidden>{REASON_GLYPH[r.key]}</span>
                  <span className="plp-aud-n">{r.n}</span>
                  <span className="plp-aud-d">{r.d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── すべて、スマホで（フォン図・完全中央） ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap plp-complete-c">
            <h2 className="plp-h2" data-st>すべて、スマホで。</h2>
            <div className="plp-phone" data-st aria-hidden>
              <div className="plp-phone-body">
                <span className="plp-phone-dot d1" /><span className="plp-phone-dot d2" /><span className="plp-phone-dot d3" />
                <span className="plp-phone-line l1" /><span className="plp-phone-line l2" /><span className="plp-phone-line l3" />
                <span className="plp-phone-pulse" />
              </div>
            </div>
            <p className="plp-lead" data-st>紹介も、進捗も、報酬の確認も。<br />アプリひとつで完結します。</p>
          </div>
        </section>

        {/* ── FAQ（アコーディオン） ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap plp-faq-wrap">
            <h2 className="plp-h2" data-st>よくある質問。</h2>
            <Faq />
            <a className="plp-textlink" href="/partners/faq" data-st>すべての質問を見る<span className="plp-arrow">→</span></a>
          </div>
        </section>

        {/* ── 応募 ── */}
        <section id="apply" className="plp-sec plp-apply plp-io">
          <div className="plp-wrap plp-form-wrap">
            {done ? (
              <div className="plp-done" data-st>
                <div className="plp-check"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                <h2 className="plp-h2">受け付けました。</h2>
                <p className="plp-lead">担当より折り返しご連絡いたします。</p>
              </div>
            ) : (
              <>
                <form className="plp-form" data-st onSubmit={submit}>
                  <label className="plp-fld"><span>お名前 <i>*</i></span><input value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" required /></label>
                  <div className="plp-fld-row">
                    <label className="plp-fld"><span>会社・屋号（任意）</span><input value={org} onChange={e => setOrg(e.target.value)} placeholder="〇〇会計事務所" /></label>
                    <label className="plp-fld"><span>ご専門（任意）</span><input value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="例：税理士" /></label>
                  </div>
                  <div className="plp-fld-row">
                    <label className="plp-fld"><span>メールアドレス <i>*</i></span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" autoComplete="off" required /></label>
                    <label className="plp-fld"><span>電話番号（任意）</span><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" /></label>
                  </div>
                  <label className="plp-fld"><span>ひとこと（任意）</span><input value={message} onChange={e => setMessage(e.target.value)} placeholder="例：顧問先からの相談が増えています" /></label>
                  <label className="plp-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>株式会社Media Birth からのご連絡に同意します。いただいた情報はご案内のためにのみ使用します。</span></label>
                  {err && <p className="plp-err">{err}</p>}
                  <button className="plp-cta plp-cta-full" type="submit" disabled={busy}>{busy ? '送信中…' : 'パートナーに応募する'}</button>
                </form>
              </>
            )}
          </div>
          <footer className="plp-footer">
            <div className="plp-foot-top">
              <div className="plp-foot-brand">
                <a className="plp-hd-logo" href="#top" aria-label="MB Partners">
                  <svg viewBox="0 0 48 48" fill="none" aria-hidden><g stroke="#4733E6" strokeWidth="2.2" strokeLinecap="round" opacity="0.4"><line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" /></g><rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6" /><circle cx="39" cy="14" r="3.6" fill="#8B5CF6" /><rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" strokeWidth="2.4" /><circle cx="10" cy="37" r="4" fill="#4733E6" /><circle cx="8" cy="21" r="2.8" stroke="#4733E6" strokeWidth="2.4" /><rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6" /></svg>
                  <b>MB<span> Partners</span></b>
                </a>
                <p className="plp-foot-tag">「つながり」を、資産に。</p>
              </div>
              <dl className="plp-foot-info">
                <div><dt>運営会社</dt><dd>株式会社Media Birth</dd></div>
                <div><dt>事業内容</dt><dd>パートナープログラム「MB Partners」の運営／ブランディング・制作・DX・人材など各領域の支援</dd></div>
              </dl>
            </div>
            <div className="plp-foot-bottom">
              <nav className="plp-foot-nav">
                <a href="/partners/guide">はじめてガイド</a>
                <a href="/partners/rewards">報酬について</a>
                <a href="/partners/faq">よくある質問</a>
                <a href="/legal/privacy">プライバシーポリシー</a>
                <a href="/legal/terms">利用規約</a>
              </nav>
              <span className="plp-foot-copy">© 2026 株式会社Media Birth</span>
            </div>
          </footer>
        </section>
      </div>
    </main>
  )
}

const CSS = `
.plp{--ink:#1a1830;--ink2:#54506e;--mut:#9a95b0;--line:rgba(26,24,48,.09);
  --indigo:#5646e6;--violet:#8b5cf6;--teal:#15917e;--gold:#f2971b;
  color:var(--ink);font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative;}
.plp *{box-sizing:border-box;margin:0;}
.plp-field{position:fixed;inset:0;z-index:0;background:
  radial-gradient(58% 46% at 14% 4%,#efeaff 0%,rgba(239,234,255,0) 60%),
  radial-gradient(52% 42% at 92% 6%,#eae4ff 0%,rgba(234,228,255,0) 58%),
  radial-gradient(60% 55% at 78% 96%,#fff1e6 0%,rgba(255,241,230,0) 60%),
  radial-gradient(50% 50% at 40% 60%,#f3f0ff 0%,rgba(243,240,255,0) 70%),
  linear-gradient(180deg,#fbfaff,#f5f3ff);}
.plp-scene{position:fixed;inset:0;z-index:1;pointer-events:none;}
.plp-progress{position:fixed;top:0;left:0;right:0;height:3px;transform:scaleX(0);transform-origin:left;background:linear-gradient(90deg,#5646e6,#8b5cf6,#f2971b);z-index:70;will-change:transform;}
.plp-glow{position:fixed;top:0;left:0;width:560px;height:560px;margin:-280px;border-radius:50%;background:radial-gradient(circle,rgba(124,108,240,.16),rgba(124,108,240,0) 66%);pointer-events:none;z-index:1;will-change:transform;}
.plp-content{position:relative;z-index:2;}

.plp-io [data-st]{opacity:0;transform:translateY(16px) scale(.985);transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1);}
.plp-io.in [data-st]{opacity:1;transform:none;}
.plp-pop{animation:numpop .55s cubic-bezier(.34,1.56,.64,1);}
@keyframes numpop{0%{transform:scale(1)}42%{transform:scale(1.09)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.plp-io [data-st]{opacity:1!important;transform:none!important;transition:none!important;} .plp *{animation:none!important;} .plp-glow{display:none;}}

.plp-hd{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;padding:15px 32px;background:rgba(251,250,255,.66);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);box-shadow:0 1px 0 var(--line);}
.plp-hd-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);}
.plp-hd-logo svg{height:27px;width:27px;display:block;overflow:visible;}
.plp-hd-logo svg circle,.plp-hd-logo svg rect{transition:transform .4s cubic-bezier(.34,1.56,.64,1);transform-box:fill-box;transform-origin:center;}
.plp-hd-logo svg g{transition:opacity .5s ease;animation:mblink 4.4s ease-in-out infinite;}
.plp-hd-logo:hover svg circle,.plp-hd-logo:hover svg rect{transform:scale(1.14);}
.plp-hd-logo:hover svg g{opacity:.8!important;}
.plp-hd-logo svg rect:nth-of-type(1){animation:mbtwinkle 3.4s ease-in-out infinite;animation-delay:0s;}
.plp-hd-logo svg circle:nth-of-type(1){animation:mbtwinkle 3.4s ease-in-out infinite;animation-delay:.6s;}
.plp-hd-logo svg rect:nth-of-type(2){animation:mbtwinkle 3.4s ease-in-out infinite;animation-delay:1.2s;}
.plp-hd-logo svg circle:nth-of-type(2){animation:mbtwinkle 3.4s ease-in-out infinite;animation-delay:1.8s;}
.plp-hd-logo svg circle:nth-of-type(3){animation:mbtwinkle 3.4s ease-in-out infinite;animation-delay:2.4s;}
@keyframes mbtwinkle{0%,100%{opacity:.6}16%{opacity:1}}
@keyframes mblink{0%,100%{opacity:.32}50%{opacity:.58}}
@media (prefers-reduced-motion:reduce){.plp-hd-logo svg *{animation:none!important}}
.plp-hd-logo b{font-weight:800;font-size:1rem;letter-spacing:-.02em;} .plp-hd-logo b span{color:var(--indigo);}
.plp-hd-actions{display:flex;align-items:center;gap:10px;}
.plp-hd-apply{height:38px;padding:0 20px;border-radius:999px;background:linear-gradient(100deg,#5646e6,#7c4ff0);color:#fff;border:none;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(86,70,230,.28);transition:transform .18s,box-shadow .18s,filter .18s;}
.plp-hd-apply:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(86,70,230,.4);filter:brightness(1.05);}
.plp-hd-login{display:inline-flex;align-items:center;height:38px;padding:0 20px;border-radius:999px;border:1.4px solid rgba(86,70,230,.32);color:var(--indigo);background:rgba(255,255,255,.5);text-decoration:none;font-size:.82rem;font-weight:700;letter-spacing:.01em;transition:background .18s,border-color .18s,transform .18s;}
.plp-hd-login:hover{background:var(--indigo);border-color:var(--indigo);color:#fff;transform:translateY(-1px);}

.plp-hero{min-height:100svh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;max-width:1120px;margin:0 auto;padding:120px 28px 80px;}
.plp-eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.42em;color:var(--indigo);opacity:.8;margin-bottom:26px;padding-left:.42em;}
.plp-h1{font-size:clamp(1.7rem,6.2vw,4.3rem);font-weight:800;line-height:1.16;letter-spacing:-.04em;color:var(--ink);}
.plp-h1l{display:block;white-space:nowrap;}
.plp-quote{color:var(--indigo);}
.plp-h1 em{font-style:normal;background:linear-gradient(105deg,#5646e6,#8b5cf6 46%,#f2971b);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-cta-row{margin-top:44px;display:flex;align-items:center;gap:22px;flex-wrap:wrap;justify-content:center;}
.plp-cta{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:58px;padding:0 42px;border-radius:999px;background:linear-gradient(100deg,#5646e6,#7c4ff0);color:#fff;border:none;font:inherit;font-size:15px;font-weight:650;cursor:pointer;box-shadow:0 12px 34px rgba(86,70,230,.34);transition:transform .2s,box-shadow .2s,filter .2s;}
.plp-cta:hover{transform:translateY(-3px);box-shadow:0 20px 46px rgba(86,70,230,.44);filter:brightness(1.06);}
.plp-cta:active{transform:none;} .plp-cta:disabled{opacity:.55;cursor:default;} .plp-cta-full{width:100%;height:60px;margin-top:6px;}
.plp-arrow{transition:transform .22s;} .plp-cta:hover .plp-arrow{transform:translateX(5px);}
.plp-cta-note{font-size:.78rem;color:var(--mut);}
.plp-scrollcue{margin-top:60px;width:24px;height:38px;border-radius:14px;border:1.5px solid rgba(86,70,230,.35);position:relative;}
.plp-scrollcue span{position:absolute;top:8px;left:50%;width:4px;height:8px;border-radius:2px;background:var(--indigo);transform:translateX(-50%);animation:cue 1.8s ease-in-out infinite;}
@keyframes cue{0%{opacity:0;transform:translate(-50%,0)}30%{opacity:1}70%{opacity:1}100%{opacity:0;transform:translate(-50%,12px)}}

.plp-sec{padding:clamp(78px,11vh,130px) 0;position:relative;}
.plp-wrap{width:100%;max-width:1080px;margin:0 auto;padding:0 28px;}
.plp-h2{font-size:clamp(1.75rem,3.6vw,2.4rem);font-weight:800;letter-spacing:-.035em;color:var(--ink);text-align:center;margin-bottom:clamp(40px,6vw,64px);text-wrap:balance;}

/* セクションラベル(テンプレ帯を避けた識別子) */
.plp-kicker{display:flex;align-items:center;justify-content:center;gap:9px;font-size:.72rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--indigo);margin-bottom:clamp(30px,4.6vw,48px);padding-left:.3em;}
.plp-kicker-dot{width:6px;height:6px;border-radius:50%;background:var(--indigo);box-shadow:0 0 0 4px rgba(86,70,230,.14);animation:kdot 2.4s ease-in-out infinite;}
@keyframes kdot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.6);opacity:.5}}

/* 視認性ヴェール(背景シナプスを局所的に鎮める) */
.plp-calm > .plp-wrap{position:relative;z-index:1;}
.plp-calm::before{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1120px,126%);height:118%;background:radial-gradient(ellipse 58% 52% at 50% 50%,rgba(250,249,255,.9) 0%,rgba(250,249,255,.66) 44%,rgba(250,249,255,0) 75%);z-index:0;pointer-events:none;}

/* 数字(実績) */
.plp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
.plp-stat{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:14px 8px;}
.plp-statnum{font-size:clamp(3.4rem,7vw,5.6rem);font-weight:820;line-height:1.04;letter-spacing:-.05em;background:linear-gradient(155deg,#5646e6,#8b5cf6 55%,#f2971b);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums;}
.plp-statlab{font-size:.82rem;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--ink2);padding-left:.24em;}

/* 流れ：動くオブジェクト(つなげる/はなす/もたらす) */
.plp-steps{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:26px;}
.plp-thread{position:absolute;top:52px;left:16.6%;width:66.8%;height:2px;background:linear-gradient(90deg,rgba(86,70,230,.45),rgba(21,145,126,.45),rgba(242,151,27,.45));border-radius:2px;transform:scaleX(0);transform-origin:left;transition:transform 1.3s cubic-bezier(.4,0,.2,1) .1s;z-index:0;}
.plp-steps.seq .plp-thread{transform:scaleX(1);}
.plp-step{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center;}
.plp-step-obj{width:104px;height:104px;border-radius:28px;display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:24px;background:linear-gradient(158deg,rgba(255,255,255,.92),rgba(244,242,255,.72));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.92);animation:floaty 5s ease-in-out infinite;}
.plp-step-obj svg{width:56px;height:56px;overflow:visible;}
.plp-step-obj.b1{color:var(--indigo);box-shadow:0 20px 46px rgba(86,70,230,.22);}
.plp-step-obj.b2{color:var(--teal);box-shadow:0 20px 46px rgba(21,145,126,.2);animation-delay:.7s;}
.plp-step-obj.b3{color:var(--gold);box-shadow:0 20px 46px rgba(242,151,27,.24);animation-delay:1.4s;}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)}}
.pg-node{fill:currentColor;opacity:.9;animation:pgpulse 2.4s ease-in-out infinite;}
.pg-node:nth-of-type(2){animation-delay:1.2s;}
@keyframes pgpulse{0%,100%{opacity:.9}50%{opacity:.4}}
.pg-travel{animation:pgtravel 2.1s ease-in-out infinite;}
@keyframes pgtravel{0%,100%{transform:translateX(0)}50%{transform:translateX(11px)}}
.pg-blink{animation:pgpulse 1.5s ease-in-out infinite;}
.pg-lid{transform-box:fill-box;transform-origin:center bottom;animation:lidlift 2.8s ease-in-out infinite;}
@keyframes lidlift{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}
.pg-spark{transform-box:fill-box;transform-origin:center;animation:sparktw 2.1s ease-in-out infinite;}
@keyframes sparktw{0%,100%{opacity:.35;transform:scale(.55)}50%{opacity:1;transform:scale(1.05) rotate(90deg)}}
.plp-step-t{font-size:1.32rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.plp-step-d{margin-top:10px;font-size:.92rem;line-height:1.7;color:var(--ink2);}

/* 報酬：フラットイラスト(固定/成果/継続) */
.plp-rewards{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;max-width:840px;margin:0 auto;}
.plp-rw{display:flex;flex-direction:column;align-items:center;gap:16px;}
.plp-rw-card{width:100%;aspect-ratio:1/1;max-width:200px;border-radius:26px;display:flex;align-items:center;justify-content:center;color:var(--rc);background:linear-gradient(158deg,rgba(255,255,255,.9),rgba(244,242,255,.68));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.92);box-shadow:0 22px 54px rgba(40,30,80,.1);transition:transform .22s,box-shadow .22s;}
.plp-rw:hover .plp-rw-card{transform:translateY(-6px);box-shadow:0 30px 64px color-mix(in srgb,var(--rc) 22%,rgba(40,30,80,.12));}
.plp-rw-card svg{width:84px;height:84px;}
.plp-rw-t{font-size:1.4rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.plp-rw-d{font-size:.82rem;color:var(--ink2);margin-top:-8px;}
/* fee type：動くオブジェクト */
.ri-coin{transform-box:fill-box;transform-origin:center;animation:cointurn 3.6s ease-in-out infinite;}
@keyframes cointurn{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.72)}}
.ri-bar{transform-box:fill-box;transform-origin:bottom;animation:bargrow 2.6s ease-in-out infinite;}
.ri-bar.rb2{animation-delay:.22s;} .ri-bar.rb3{animation-delay:.44s;}
@keyframes bargrow{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.6)}}
.ri-cyc{transform-box:view-box;transform-origin:44px 44px;animation:cspin 6.5s linear infinite;}
@keyframes cspin{to{transform:rotate(360deg)}}

/* field：業種チップ（動くオブジェクト・拡大前提） */
.plp-fields{display:flex;flex-wrap:wrap;justify-content:center;gap:clamp(16px,2.6vw,34px);max-width:940px;margin:0 auto;}
.plp-fchip{flex:0 0 auto;width:clamp(96px,13vw,124px);display:flex;flex-direction:column;align-items:center;gap:14px;}
.plp-fobj{width:clamp(74px,10vw,88px);height:clamp(74px,10vw,88px);border-radius:24px;display:flex;align-items:center;justify-content:center;color:var(--fc);background:linear-gradient(158deg,rgba(255,255,255,.92),rgba(244,242,255,.72));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.92);box-shadow:0 16px 40px rgba(40,30,80,.09);animation:floaty 5.2s ease-in-out infinite;transition:transform .2s,box-shadow .2s;}
.plp-fchip:nth-child(2) .plp-fobj{animation-delay:.5s;} .plp-fchip:nth-child(3) .plp-fobj{animation-delay:1s;} .plp-fchip:nth-child(4) .plp-fobj{animation-delay:1.5s;} .plp-fchip:nth-child(5) .plp-fobj{animation-delay:.8s;} .plp-fchip:nth-child(6) .plp-fobj{animation-delay:1.3s;}
.plp-fchip:hover .plp-fobj{transform:translateY(-7px);box-shadow:0 26px 56px color-mix(in srgb,var(--fc) 22%,rgba(40,30,80,.1));}
.plp-fobj svg{width:clamp(38px,5vw,46px);height:clamp(38px,5vw,46px);transform-box:fill-box;transform-origin:center;}
.fobj-brand svg{animation:fbeat 2.6s ease-in-out infinite;} .fobj-design svg{animation:fwiggle 3s ease-in-out infinite;}
.fobj-web svg{animation:fbob 3s ease-in-out infinite;} .fobj-video svg{animation:fbeat 2.2s ease-in-out infinite;}
.fobj-dev svg{animation:fbob 3.2s ease-in-out infinite;} .fobj-ops svg{animation:fspin 8s linear infinite;}
.fobj-dx svg{animation:fbeat 2.4s ease-in-out infinite;} .fobj-bpo svg{animation:fspin 9s linear infinite;}
.fobj-hr svg{animation:fbeat 2.6s ease-in-out infinite;} .fobj-growth svg{animation:fbob 3s ease-in-out infinite;}
.fobj-estate svg{animation:fbob 3.4s ease-in-out infinite;} .fobj-enta svg{animation:fbeat 2.3s ease-in-out infinite;}
@keyframes fbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes fbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.13)}}
@keyframes fwiggle{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
@keyframes fspin{to{transform:rotate(360deg)}}
@keyframes fshake{0%,100%{transform:rotate(-5deg)}25%{transform:rotate(5deg)}50%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
.plp-fname{font-size:.98rem;font-weight:800;letter-spacing:-.01em;color:var(--ink);}
.plp-fchip-more .plp-fobj{flex-direction:column;gap:1px;color:var(--mut);border-style:dashed;background:rgba(255,255,255,.36);box-shadow:none;animation:none;}
.plp-fchip-more .plp-fobj b{font-size:1.7rem;font-weight:300;line-height:1;} .plp-fchip-more .plp-fobj i{font-style:normal;font-size:.66rem;font-weight:600;letter-spacing:.02em;}

/* こんな方へ（枠なし・浮遊オブジェクト） */
.plp-aud{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(16px,2.4vw,30px);max-width:920px;margin:0 auto;}
.plp-audcard{display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;}
.plp-audcard:hover .plp-aud-obj{transform:translateY(-8px);box-shadow:0 28px 58px color-mix(in srgb,var(--fc) 24%,rgba(40,30,80,.12));}
.plp-audcard:hover .plp-aud-n{color:var(--fc);}
.plp-aud-obj{width:clamp(80px,9vw,96px);height:clamp(80px,9vw,96px);border-radius:26px;display:flex;align-items:center;justify-content:center;color:var(--fc);background:linear-gradient(158deg,rgba(255,255,255,.92),rgba(244,242,255,.72));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.92);box-shadow:0 18px 44px rgba(40,30,80,.1);animation:floaty 5.4s ease-in-out infinite;transition:transform .22s,box-shadow .22s;}
.plp-audcard:nth-child(2) .plp-aud-obj{animation-delay:.6s;} .plp-audcard:nth-child(3) .plp-aud-obj{animation-delay:1.2s;} .plp-audcard:nth-child(4) .plp-aud-obj{animation-delay:1.8s;}
.plp-aud-obj svg{width:clamp(42px,5vw,50px);height:clamp(42px,5vw,50px);transform-box:fill-box;transform-origin:center;}
.plp-aud-n{transition:color .18s;}
.aud-expert svg{animation:fbob 3s ease-in-out infinite;} .aud-exec svg{animation:fbeat 2.5s ease-in-out infinite;} .aud-sales svg{animation:fwiggle 3s ease-in-out infinite;} .aud-company svg{animation:fbeat 2.2s ease-in-out infinite;}
.plp-aud-n{font-size:1.05rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.plp-aud-d{font-size:.82rem;line-height:1.65;color:var(--ink2);}

/* FAQ（アコーディオン） */
.plp-faq-wrap{max-width:720px;}
.plp-faq{display:flex;flex-direction:column;gap:12px;}
.plp-faq-item{border-radius:16px;background:rgba(255,255,255,.6);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);border:0.5px solid rgba(255,255,255,.85);box-shadow:0 8px 30px rgba(40,30,80,.06);overflow:hidden;transition:box-shadow .25s;}
.plp-faq-item.open{box-shadow:0 16px 46px rgba(86,70,230,.13);}
.plp-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;background:none;border:none;cursor:pointer;font:inherit;font-size:1rem;font-weight:700;color:var(--ink);text-align:left;letter-spacing:-.01em;transition:color .18s;}
.plp-faq-q:hover{color:var(--indigo);}
.plp-faq-chev{width:10px;height:10px;border-right:2.2px solid var(--indigo);border-bottom:2.2px solid var(--indigo);transform:rotate(45deg);transition:transform .3s cubic-bezier(.34,1.56,.64,1);flex-shrink:0;margin-right:5px;margin-top:-3px;}
.plp-faq-item.open .plp-faq-chev{transform:rotate(-135deg);margin-top:3px;}
.plp-faq-a{max-height:0;overflow:hidden;transition:max-height .4s cubic-bezier(.4,0,.2,1);}
.plp-faq-item.open .plp-faq-a{max-height:240px;}
.plp-faq-a p{padding:0 24px 22px;font-size:.9rem;line-height:1.85;color:var(--ink2);}

/* MBプロダクト マーキー（横スクロール・ずっと動く） */
.plp-mq-sec{position:relative;z-index:2;padding:clamp(56px,8vh,96px) 0;overflow:hidden;background:linear-gradient(180deg,rgba(250,249,255,0),rgba(250,249,255,.5),rgba(250,249,255,0));}
.plp-mq-kicker{margin-bottom:30px;}
.plp-marquee{width:100%;overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);mask:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);}
.plp-mq-track{display:flex;width:max-content;animation:marq 34s linear infinite;}
@keyframes marq{to{transform:translateX(-50%)}}
.plp-mq-item{display:inline-flex;align-items:center;white-space:nowrap;font-size:clamp(1.5rem,3.2vw,2.3rem);font-weight:800;letter-spacing:-.01em;padding-right:clamp(40px,5.5vw,72px);color:var(--mut);transition:color .3s;}
.plp-mq-item:hover{color:var(--c);}
.plp-mq-logo{display:inline-flex;align-items:center;padding-right:clamp(40px,5.5vw,72px);}
.plp-mq-logo img{height:clamp(26px,3vw,38px);width:auto;display:block;filter:grayscale(1) opacity(.6);transition:filter .3s,opacity .3s;}
/* ENTERSOLOGYは字形がviewBox全高いっぱいで一つだけ大きく見えるため、視覚的キャップハイトを他ロゴに合わせて縮小 */
.plp-mq-logo img[src*="entersology"]{height:clamp(20px,2.35vw,30px);}
.plp-mq-logo:hover img{filter:grayscale(0) opacity(1);}

/* field belt（横スクロール・ホバーで一時停止） */
.plp-field-sec{overflow:hidden;}
.plp-fmarquee{margin-top:2px;}
.plp-ftrack{animation-duration:46s;}
.plp-fmarquee:hover .plp-mq-track{animation-play-state:paused;}
.plp-fmq{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:13px;padding:10px clamp(22px,2.8vw,42px);}
.plp-fmq .plp-fobj{animation:none;transition:transform .22s,box-shadow .22s;}
.plp-fmq:hover .plp-fobj{transform:translateY(-7px);box-shadow:0 24px 54px color-mix(in srgb,var(--fc) 22%,rgba(40,30,80,.1));}
.plp-fmq .plp-fname{transition:color .18s;} .plp-fmq:hover .plp-fname{color:var(--fc);}
.plp-fmq .plp-fname{white-space:nowrap;font-size:.92rem;}

/* ホバー磨き込み */
.plp-stat{transition:transform .28s cubic-bezier(.22,1,.36,1);} .plp-stat:hover{transform:translateY(-5px);}
.plp-foot-meta a{transition:color .18s;} .plp-foot-meta a:hover{color:var(--violet);}

/* 安心の一行 */
.plp-trust{display:flex;justify-content:center;flex-wrap:wrap;gap:10px 22px;margin-bottom:24px;}
.plp-trust-item{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:600;color:var(--ink2);transition:color .18s;}
.plp-trust-item:hover{color:var(--ink);} .plp-trust-item svg{color:var(--indigo);}

/* 報酬シミュレーター（例示・仮） */
.plp-sim-wrap{max-width:560px;text-align:center;}
.plp-sim{background:rgba(255,255,255,.66);backdrop-filter:blur(20px) saturate(1.2);-webkit-backdrop-filter:blur(20px) saturate(1.2);border:0.5px solid rgba(255,255,255,.85);border-radius:24px;box-shadow:0 22px 60px rgba(40,30,80,.1);padding:clamp(28px,4vw,42px);}
.plp-sim-row{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;font-size:.9rem;font-weight:600;color:var(--ink2);}
.plp-sim-x{color:var(--mut);} .plp-sim-cnt{color:var(--indigo);font-weight:800;}
.plp-sim-total{margin-top:14px;font-size:clamp(2.6rem,7vw,3.8rem);font-weight:820;letter-spacing:-.04em;color:var(--ink);font-variant-numeric:tabular-nums;display:flex;align-items:center;justify-content:center;}
.plp-sim-total i{font-size:1rem;font-weight:700;font-style:normal;color:var(--mut);margin-left:2px;align-self:flex-end;margin-bottom:.5em;}
.plp-sim-eg{font-size:.72rem;font-weight:700;color:#fff;background:var(--indigo);border-radius:6px;padding:3px 8px;margin-right:10px;letter-spacing:.06em;}
.plp-sim-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;margin-top:26px;border-radius:6px;background:linear-gradient(90deg,var(--indigo) var(--p,30%),rgba(86,70,230,.16) var(--p,30%));outline:none;cursor:pointer;}
.plp-sim-range::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;border:3px solid var(--indigo);box-shadow:0 4px 14px rgba(86,70,230,.4);cursor:grab;transition:transform .15s;}
.plp-sim-range::-webkit-slider-thumb:active{transform:scale(1.15);cursor:grabbing;}
.plp-sim-range::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--indigo);box-shadow:0 4px 14px rgba(86,70,230,.4);cursor:grab;}
.plp-sim-scale{display:flex;justify-content:space-between;margin-top:11px;font-size:.72rem;color:var(--mut);}
.plp-sim-note{margin-top:18px;font-size:.7rem;line-height:1.6;color:var(--mut);}

/* 安心して紹介できる理由（3列・枠なし） */
.plp-reasons{grid-template-columns:repeat(3,1fr)!important;max-width:860px!important;}
.plp-complete-c{display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(30px,4vw,46px);}
.plp-complete-c .plp-h2{margin-bottom:0;}
.plp-complete-c .plp-lead{margin:0;text-align:center;max-width:28em;}
.rgl-secure svg{animation:fbeat 2.6s ease-in-out infinite;} .rgl-nospam svg{animation:fwiggle 3s ease-in-out infinite;} .rgl-wedo svg{animation:fbob 3s ease-in-out infinite;}

/* すべてスマホで：動くオブジェクト */
.cg-travel{transform-box:fill-box;transform-origin:center;animation:cgtravel 2s ease-in-out infinite;}
@keyframes cgtravel{0%,100%{transform:translateX(0);opacity:1}50%{transform:translateX(15px);opacity:.55}}
.cgl-track .cg-check{transform-box:fill-box;transform-origin:center;animation:cgcheck 2.4s ease-in-out infinite;}
@keyframes cgcheck{0%,100%{transform:scale(1)}50%{transform:scale(1.16)}}
.cgl-reward svg{animation:cointurn 3.4s ease-in-out infinite;}

/* field：白タイルで統一・2段の逆スクロールで広がりを表現 */
.plp-fmarquee{overflow:visible;padding:11px 0;}
.plp-fmarquee+.plp-fmarquee{margin-top:0;}
.plp-ftrack-r{animation-direction:reverse;}
.plp-fmq .plp-fobj{background:linear-gradient(158deg,rgba(255,255,255,.94),rgba(244,242,255,.72));border:1px solid rgba(255,255,255,.92);}
.plp-fmq:hover .plp-fobj{transform:translateY(-6px);box-shadow:0 24px 54px color-mix(in srgb,var(--fc) 20%,rgba(40,30,80,.1));}
.plp-fmq:hover .plp-fname{color:var(--fc);}
.plp-fmq .plp-fname{white-space:nowrap;font-size:.92rem;}

/* 数字は中央寄せ */
.plp-stat>*{width:100%;}
.plp-statnum{display:block;width:100%;text-align:center;text-indent:-.05em;}

/* テキストリンク（下層ページ導線） */
.plp-textlink{display:inline-flex;align-items:center;gap:8px;margin-top:34px;font-size:.92rem;font-weight:700;color:var(--indigo);text-decoration:none;transition:gap .2s,color .2s;}
.plp-textlink:hover{gap:13px;color:var(--violet);}
.plp-textlink .plp-arrow{transition:transform .2s;} .plp-textlink:hover .plp-arrow{transform:translateX(3px);}

/* フッターナビ */
.plp-foot-nav{display:flex;flex-wrap:wrap;gap:12px 22px;}
.plp-foot-nav a{font-size:.8rem;font-weight:600;color:var(--ink2);text-decoration:none;transition:color .18s;}
.plp-foot-nav a:hover{color:var(--indigo);}

/* スマホで完結 */
.plp-complete{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:clamp(40px,7vw,90px);}
.plp-complete-txt .plp-h2{text-align:left;margin-bottom:18px;}
.plp-complete .plp-lead{text-align:left;margin:0;}
.plp-lead{font-size:15px;line-height:1.85;color:var(--ink2);}
.plp-phone{display:flex;justify-content:center;}
.plp-phone-body{position:relative;width:168px;height:340px;border-radius:34px;background:linear-gradient(160deg,rgba(255,255,255,.86),rgba(245,243,255,.72));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.9);box-shadow:0 30px 70px rgba(86,70,230,.22),inset 0 1px 0 rgba(255,255,255,.9);overflow:hidden;}
.plp-phone-body::before{content:'';position:absolute;top:14px;left:50%;transform:translateX(-50%);width:44px;height:5px;border-radius:3px;background:rgba(26,24,48,.14);}
.plp-phone-dot{position:absolute;left:26px;width:26px;height:26px;border-radius:8px;}
.plp-phone-dot.d1{top:52px;background:radial-gradient(circle at 38% 34%,#8b5cf6,#5646e6);animation:pop 3s ease-in-out infinite;}
.plp-phone-dot.d2{top:130px;background:radial-gradient(circle at 38% 34%,#3ec6a0,#15917e);animation:pop 3s ease-in-out .5s infinite;}
.plp-phone-dot.d3{top:208px;background:radial-gradient(circle at 38% 34%,#ffc24d,#f2971b);animation:pop 3s ease-in-out 1s infinite;}
.plp-phone-line{position:absolute;left:64px;height:9px;border-radius:5px;background:rgba(86,70,230,.14);}
.plp-phone-line.l1{top:54px;width:70px;} .plp-phone-line.l2{top:132px;width:58px;} .plp-phone-line.l3{top:210px;width:66px;}
.plp-phone-pulse{position:absolute;left:39px;top:64px;width:3px;height:158px;background:linear-gradient(180deg,rgba(86,70,230,.5),rgba(242,151,27,.5));border-radius:2px;opacity:.5;}
@keyframes pop{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}

/* 応募 */
.plp-apply{padding-bottom:40px;}
.plp-form-head{margin-bottom:34px;}
.plp-form-wrap{max-width:640px;}
.plp-form{display:flex;flex-direction:column;gap:15px;padding:clamp(26px,4vw,42px);border-radius:26px;background:rgba(255,255,255,.72);backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3);border:0.5px solid rgba(255,255,255,.85);box-shadow:0 24px 70px rgba(40,30,80,.12);}
.plp-fld-row{display:grid;grid-template-columns:1fr 1fr;gap:15px;}
.plp-fld{display:flex;flex-direction:column;gap:8px;}
.plp-fld>span{font-size:.74rem;font-weight:600;color:var(--ink2);} .plp-fld>span i{color:var(--indigo);font-style:normal;}
.plp-fld input{width:100%;min-height:50px;background:rgba(255,255,255,.8);border:0.5px solid rgba(26,24,48,.14);border-radius:13px;padding:0 15px;color:var(--ink);font:inherit;font-size:.95rem;transition:border-color .18s,box-shadow .18s,background .18s;}
.plp-fld input::placeholder{color:#a6a3b3;}
.plp-fld input:focus{outline:none;border-color:var(--indigo);background:#fff;box-shadow:0 0 0 4px rgba(124,108,240,.16);}
.plp-consent{display:flex;gap:11px;align-items:flex-start;margin-top:4px;cursor:pointer;}
.plp-consent input{margin-top:3px;width:16px;height:16px;accent-color:var(--indigo);flex-shrink:0;}
.plp-consent span{font-size:.76rem;line-height:1.7;color:var(--ink2);}
.plp-err{font-size:.8rem;color:#d64545;}
.plp-done{text-align:center;padding:48px 24px;}
.plp-check{width:64px;height:64px;border-radius:50%;background:linear-gradient(150deg,#5646e6,#7c4ff0);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 14px 40px rgba(86,70,230,.4);}
.plp-footer{border-top:0.5px solid var(--line);margin:84px auto 0;padding:48px 28px 40px;max-width:1080px;}
.plp-foot-top{display:grid;grid-template-columns:1fr 1.5fr;gap:44px;align-items:start;}
.plp-foot-brand .plp-hd-logo{margin-bottom:14px;}
.plp-foot-tag{font-size:.82rem;color:var(--ink2);line-height:1.7;}
.plp-foot-info{display:flex;flex-direction:column;gap:13px;}
.plp-foot-info>div{display:grid;grid-template-columns:88px 1fr;gap:16px;font-size:.82rem;line-height:1.75;}
.plp-foot-info dt{color:var(--mut);font-weight:600;} .plp-foot-info dd{color:var(--ink2);}
.plp-foot-bottom{margin-top:38px;padding-top:24px;border-top:0.5px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px 24px;}
.plp-foot-copy{font-size:.74rem;color:var(--mut);}

@media (max-width:820px){
  .plp-hd{padding:11px 18px;}
  .plp-hd-login{height:36px;padding:0 16px;font-size:.78rem;}
  .plp-hero{padding:104px 22px 56px;}
  .plp-h1{font-size:clamp(1.4rem,6.5vw,2rem);line-height:1.2;letter-spacing:-.035em;}
  .plp-fields{gap:14px 12px;} .plp-fname{font-size:.86rem;}
  .plp-sec{padding:66px 0;}
  .plp-stats{grid-template-columns:repeat(3,1fr);gap:6px;}
  .plp-stat{padding:8px 2px;gap:8px;}
  .plp-statnum{font-size:clamp(1.3rem,6.4vw,1.95rem);}
  .plp-statlab{font-size:.56rem;letter-spacing:.14em;padding-left:.14em;}
  .plp-steps{grid-template-columns:repeat(3,1fr);gap:10px;} .plp-thread{display:none;}
  .plp-step-obj{width:clamp(56px,17vw,74px);height:clamp(56px,17vw,74px);margin-bottom:12px;} .plp-step-obj svg{width:clamp(30px,10vw,42px);height:clamp(30px,10vw,42px);}
  .plp-step-t{font-size:.94rem;} .plp-step-d{font-size:.72rem;line-height:1.5;margin-top:6px;}
  .plp-rewards{gap:12px;}
  .plp-rw-card{border-radius:20px;} .plp-rw-card svg{width:52px;height:52px;}
  .plp-rw-t{font-size:1.05rem;} .plp-rw-d{font-size:.68rem;margin-top:-6px;}
  .plp-complete{grid-template-columns:1fr;gap:34px;justify-items:center;}
  .plp-complete-txt .plp-h2,.plp-complete .plp-lead{text-align:center;}
  .plp-complete .plp-lead br{display:none;}
  .plp-fld-row{grid-template-columns:1fr;}
  .plp-aud{grid-template-columns:1fr 1fr;gap:26px 12px;} .plp-audcard{gap:12px;} .plp-aud-obj{width:72px;height:72px;border-radius:20px;} .plp-aud-obj svg{width:40px;height:40px;} .plp-aud-n{font-size:.92rem;} .plp-aud-d{font-size:.74rem;}
  .plp-faq-q{font-size:.9rem;padding:16px 18px;} .plp-faq-a p{padding:0 18px 18px;font-size:.84rem;}
  .plp-reasons{grid-template-columns:1fr!important;gap:26px;}
  .plp-sim-total{font-size:clamp(2.2rem,11vw,3rem);}
  .plp-hd-actions{gap:8px;} .plp-hd-login,.plp-hd-apply{height:34px;padding:0 14px;font-size:.76rem;}
  .plp-hd-logo b{font-size:.94rem;}
  .plp-foot-top{grid-template-columns:1fr;gap:28px;}
  .plp-foot-info>div{grid-template-columns:76px 1fr;gap:12px;}
  .plp-foot-bottom{flex-direction:column;align-items:flex-start;gap:16px;}
}
`
