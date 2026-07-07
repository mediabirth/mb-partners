'use client'
/**
 * パートナー募集LP v3 —「つながり」という資産を運用する。ページスコープ完結（グローバル無波及）。
 * v2の「光」を土台に一流の仕上げ: 生きたヒーロー(Canvas2D・価値が流れる脈動＋カーソルで網が編まれる)・
 *   専用設計のSVGアイコン(既製寄せ集めでない)・作品級タイポ(8pxグリッド/1.25モジュラー/字間-0.045em)・スクロール演出。
 * 文言は正典(一字一句)。応募は既存 /api/partner-apply(partner_applications)。事実の正典・創作数字禁止。
 * モバイルは低負荷(カーソル演出なし・ノード削減)・reduced-motionで静止・可視時のみ描画。
 */
import { useEffect, useRef, useState } from 'react'

function useNetwork(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobile = matchMedia('(max-width: 820px)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
    const N = mobile ? 22 : 46
    const LINK = mobile ? 155 : 200
    const cols = ['124,110,238', '128,205,184', '240,190,150']
    let w = 0, h = 0
    type Node = { x: number; y: number; vx: number; vy: number; r: number; c: string }
    let nodes: Node[] = []
    type Pulse = { a: number; b: number; t: number; sp: number }
    let pulses: Pulse[] = []
    const blobs = [{ x: .2, y: .24, r: .5, c: '124,110,238' }, { x: .82, y: .3, r: .55, c: '128,205,184' }, { x: .58, y: .84, r: .5, c: '240,190,150' }]
    const seed = () => {
      nodes = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .2, vy: (Math.random() - .5) * .2, r: 1.6 + Math.random() * 2.2, c: cols[Math.floor(Math.random() * cols.length)] }))
      pulses = []
    }
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); seed() }
    resize(); addEventListener('resize', resize)
    const mouse = { x: -999, y: -999, on: false }
    if (!mobile && !reduce) {
      cv.parentElement?.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true })
      cv.parentElement?.addEventListener('pointerleave', () => { mouse.on = false })
    }
    let tick = 0
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const b of blobs) { const R = b.r * Math.min(w, h); const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, R); g.addColorStop(0, `rgba(${b.c},0.10)`); g.addColorStop(1, `rgba(${b.c},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h) }
      // links（＋脈動生成）
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < LINK) {
          ctx.strokeStyle = `rgba(90,70,230,${(1 - d / LINK) * 0.13})`; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          if (!reduce && Math.random() < 0.0009) pulses.push({ a: i, b: j, t: 0, sp: 0.012 + Math.random() * 0.014 })
        }
      }
      // 価値の脈動（つながりを"運用"する＝価値が網を流れる）
      for (const p of pulses) {
        const a = nodes[p.a], b = nodes[p.b]; const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, 'rgba(124,110,238,0.95)'); g.addColorStop(1, 'rgba(124,110,238,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fill()
      }
      // カーソル＝あなたも網の一部（近傍と結線＋発光）
      if (mouse.on) {
        for (const n of nodes) { const d = Math.hypot(n.x - mouse.x, n.y - mouse.y); if (d < 170) { ctx.strokeStyle = `rgba(90,70,230,${(1 - d / 170) * 0.32})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(n.x, n.y); ctx.stroke() } }
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 26); g.addColorStop(0, 'rgba(124,110,238,0.5)'); g.addColorStop(1, 'rgba(124,110,238,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 26, 0, 6.2832); ctx.fill()
      }
      // nodes
      for (const n of nodes) {
        let boost = 1
        if (mouse.on) { const d = Math.hypot(n.x - mouse.x, n.y - mouse.y); if (d < 170) boost = 1 + (1 - d / 170) * 1.4 }
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5 * boost); g.addColorStop(0, `rgba(${n.c},${Math.min(1, 0.9 * boost)})`); g.addColorStop(.4, `rgba(${n.c},0.35)`); g.addColorStop(1, `rgba(${n.c},0)`)
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 5 * boost, 0, 6.2832); ctx.fill()
      }
    }
    const step = () => {
      for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < -20) n.x = w + 20; if (n.x > w + 20) n.x = -20; if (n.y < -20) n.y = h + 20; if (n.y > h + 20) n.y = -20 }
      pulses = pulses.filter(p => (p.t += p.sp) < 1)
    }
    let raf = 0, visible = true
    const loop = () => { if (!visible || reduce) return; tick++; step(); draw(); raf = requestAnimationFrame(loop) }
    const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible && !reduce) loop() }, { threshold: 0 }); io.observe(cv)
    if (reduce) draw(); else loop()
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener('resize', resize) }
  }, [canvasRef])
}

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.14 })
    document.querySelectorAll('.plp-rise').forEach(el => io.observe(el))
    // ヒーロー・パララックス（スクロール連動・上品）
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const y = Math.min(scrollY, 700); document.documentElement.style.setProperty('--plp-py', String(y)) }) }
    addEventListener('scroll', onScroll, { passive: true })
    return () => { io.disconnect(); removeEventListener('scroll', onScroll) }
  }, [])
}

// ── 専用設計アイコン（統一ストローク1.5・24グリッド・寄せ集めでない一貫作画） ──
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
function Ic({ n }: { n: string }) {
  const p: Record<string, React.ReactNode> = {
    intro: <><circle cx="6.5" cy="15" r="3" {...S} /><circle cx="17.5" cy="9" r="3" {...S} /><path d="M9 13.6l6-3.2" {...S} /><path d="M18.4 15.5l3 .6-.6 3" {...S} /><path d="M14.5 18.5c2.4 1.6 5.2 1 6.9-2.4" {...S} /></>,
    handle: <><path d="M12 3l7 3v6c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6z" {...S} /><path d="M9 12.2l2.2 2.2L15.2 10" {...S} /></>,
    reward: <><circle cx="12" cy="13.5" r="6.5" {...S} /><path d="M12 10.6v5.8M9.8 11.8h4.4M9.8 14h4.4" {...S} /><path d="M12 4.2v2.2M8.5 5l1 1.9M15.5 5l-1 1.9" {...S} /></>,
    fixed: <><rect x="5.5" y="7.5" width="13" height="10" rx="2" {...S} /><circle cx="12" cy="12.5" r="2.4" {...S} /><path d="M8 4.5l2.5 3M16 4.5l-2.5 3" {...S} /></>,
    perf: <><path d="M4 20h16" {...S} /><rect x="5.5" y="13" width="3" height="5" rx="1" {...S} /><rect x="10.5" y="9" width="3" height="9" rx="1" {...S} /><rect x="15.5" y="5" width="3" height="13" rx="1" {...S} /><path d="M6 11l4.5-3.5L14 10l4-4" {...S} strokeWidth={1.1} /></>,
    recur: <><path d="M6 8.5A7 7 0 0 1 19 11" {...S} /><path d="M18 8.5V11h-2.5" {...S} /><path d="M18 15.5A7 7 0 0 1 5 13" {...S} /><path d="M6 15.5V13h2.5" {...S} /></>,
    home: <><path d="M5 11.5L12 5l7 6.5" {...S} /><path d="M7 10.5V19h10v-8.5" {...S} /><path d="M10.5 19v-4h3v4" {...S} /></>,
    people: <><circle cx="8" cy="9" r="2.6" {...S} /><circle cx="16" cy="9" r="2.6" {...S} /><path d="M3.8 18c.4-2.6 2.2-4 4.2-4s3.8 1.4 4.2 4" {...S} /><path d="M11.8 18c.4-2.6 2.2-4 4.2-4s3.8 1.4 4.2 4" {...S} /></>,
    create: <><path d="M4 18c3-1 4-4 3.5-7C11 9 14 6 19 5c-.6 5-3.4 8.2-7 9.2C9 15 6.6 16.2 4 18z" {...S} /><path d="M8 14.5l2 2" {...S} /></>,
    dx: <><circle cx="6" cy="7" r="2" {...S} /><circle cx="18" cy="7" r="2" {...S} /><circle cx="12" cy="17" r="2" {...S} /><path d="M7.5 8.5l3.5 6.8M16.5 8.5L13 15.3M8 7h8" {...S} /></>,
    phone: <><rect x="7" y="3.5" width="10" height="17" rx="2.4" {...S} /><path d="M10.5 6h3" {...S} /><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" /></>,
  }
  return <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>{p[n]}</svg>
}

export default function PartnersLP() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useNetwork(canvasRef); useReveal()
  const [name, setName] = useState(''); const [org, setOrg] = useState(''); const [expertise, setExpertise] = useState('')
  const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) { setErr('お名前を入力してください'); return }
    if (!email.trim() && !phone.trim()) { setErr('メールか電話のいずれかをご記入ください'); return }
    if (!consent) { setErr('同意の確認をお願いします'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/partner-apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, org, expertise, email, phone, message, consent }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? '送信に失敗しました。時間をおいて再度お試しください。'); return }
      setDone(true)
    } catch { setErr('送信に失敗しました。時間をおいて再度お試しください。') } finally { setBusy(false) }
  }
  const scrollForm = () => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="plp">
      <style>{CSS}</style>

      {/* ── HERO ── */}
      <section className="plp-hero">
        <canvas ref={canvasRef} className="plp-canvas" aria-hidden />
        <div className="plp-hero-inner">
          <div className="plp-nav">
            <span className="plp-wordmark">MB <span>Partners</span></span>
            <button className="plp-navcta" onClick={scrollForm}>応募する</button>
          </div>
          <div className="plp-hero-body">
            <span className="plp-kicker plp-rise">紹介パートナー・プログラム</span>
            <h1 className="plp-h1 plp-rise"><span className="plp-quote">「つながり」</span>という資産を、<br/><em>運用する。</em></h1>
            <p className="plp-sub plp-rise">知人や取引先をご紹介いただくだけ。商談も実務も <b>株式会社Media Birth</b> が担い、成約とともに報酬をお支払いします。</p>
            <div className="plp-cta-row plp-rise">
              <button className="plp-cta" onClick={scrollForm}>パートナーに応募する<span className="plp-arrow">→</span></button>
              <span className="plp-cta-note">登録無料・応募制（審査があります）</span>
            </div>
          </div>
          <div className="plp-scrollhint plp-rise" aria-hidden><span className="plp-sh-line" />SCROLL</div>
        </div>
      </section>

      {/* ── はじめかた ── */}
      <section className="plp-sec">
        <div className="plp-wrap">
          <div className="plp-head plp-rise"><span className="plp-kicker2">はじめかた</span><h2 className="plp-h2">3つのステップ。あとは、私たちが。</h2></div>
          <div className="plp-steps">
            {[
              { n: '01', ic: 'intro', t: '紹介する', d: '知人・取引先をアプリからご紹介。リンクを送るだけでも完結します。' },
              { n: '02', ic: 'handle', t: 'Media Birthが対応', d: '商談から実務まで、すべて当社が担います。進捗はアプリでいつでも。' },
              { n: '03', ic: 'reward', t: '成約で報酬', d: '成約が確定すると報酬が発生。お支払いまでアプリで完結します。' },
            ].map((s, i) => (
              <div key={s.n} className="plp-step plp-rise" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="plp-step-top"><span className="plp-step-ic"><Ic n={s.ic} /></span><span className="plp-step-n">{s.n}</span></div>
                <h3 className="plp-step-t">{s.t}</h3>
                <p className="plp-step-d">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 報酬のかたち ── */}
      <section className="plp-sec plp-sec-alt">
        <div className="plp-wrap">
          <div className="plp-head plp-rise"><span className="plp-kicker2">報酬のかたち</span><h2 className="plp-h2">メニューに応じて、3つの報酬。</h2></div>
          <div className="plp-rewards">
            {[
              { ic: 'fixed', k: '固定報酬', v: '例：¥30,000', d: 'メニューごとに定めた固定額を、成約時にお支払いします。' },
              { ic: 'perf', k: '成果連動', v: '粗利に応じて', d: '案件の粗利に連動して報酬が決まるメニューもあります。' },
              { ic: 'recur', k: '継続報酬', v: '毎月つづく', d: '契約が続くあいだ、継続的に報酬が発生するメニューもあります。' },
            ].map((r, i) => (
              <div key={r.k} className="plp-reward plp-rise" style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="plp-reward-ic"><Ic n={r.ic} /></span>
                <div className="plp-reward-k">{r.k}</div>
                <div className="plp-reward-v">{r.v}</div>
                <div className="plp-reward-d">{r.d}</div>
              </div>
            ))}
          </div>
          <p className="plp-fine plp-rise">※ 金額・条件はメニューにより異なります。上記は一例で、収入を保証するものではありません。</p>
        </div>
      </section>

      {/* ── ご紹介いただける領域 ── */}
      <section className="plp-sec">
        <div className="plp-wrap">
          <div className="plp-head plp-rise"><span className="plp-kicker2">ご紹介いただける領域</span><h2 className="plp-h2">あなたの人脈が活きる、4つの領域。</h2></div>
          <div className="plp-brands">
            {[
              { ic: 'home', b: 'MOOM', d: '不動産・お住まい' },
              { ic: 'people', b: 'MatchHub', d: '人材・採用' },
              { ic: 'create', b: 'RESONATION', d: '制作・クリエイティブ' },
              { ic: 'dx', b: 'PRAGMATION', d: 'DX・業務支援' },
            ].map((x, i) => (
              <div key={x.b} className="plp-brand plp-rise" style={{ transitionDelay: `${i * 70}ms` }}>
                <span className="plp-brand-ic"><Ic n={x.ic} /></span>
                <span className="plp-brand-b">{x.b}</span>
                <span className="plp-brand-d">{x.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── すべて、スマホで完結 ── */}
      <section className="plp-sec plp-sec-alt">
        <div className="plp-wrap plp-exp">
          <div className="plp-rise">
            <span className="plp-kicker2">すべて、スマホで完結</span>
            <h2 className="plp-h2">紹介も、進捗の確認も、<br/>報酬の受け取りも。<br/><span className="plp-accent">ひとつのアプリで。</span></h2>
          </div>
          <ul className="plp-exp-list plp-rise">
            {[
              { ic: 'intro', t: '知人・取引先を、アプリからご紹介。' },
              { ic: 'phone', t: '案件の進捗を、いつでも確認。' },
              { ic: 'reward', t: '報酬の発生から受け取りまで、アプリで完結。' },
              { ic: 'handle', t: '登録は無料。応募制で、審査のうえご案内します。' },
            ].map((t, i) => <li key={i} className="plp-rise" style={{ transitionDelay: `${i * 70}ms` }}><span className="plp-exp-ic"><Ic n={t.ic} /></span><span>{t.t}</span></li>)}
          </ul>
        </div>
      </section>

      {/* ── 応募 ── */}
      <section className="plp-sec plp-apply" id="apply">
        <div className="plp-wrap plp-form-wrap plp-rise">
          {done ? (
            <div className="plp-doneblock">
              <div className="plp-check" aria-hidden><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <h2 className="plp-h2">応募を受け付けました。</h2>
              <p className="plp-lead">内容を確認のうえ、担当者よりご連絡いたします。ありがとうございます。</p>
            </div>
          ) : (
            <>
              <div className="plp-form-head"><span className="plp-kicker2">まず、話を聞いてみる</span><h2 className="plp-h2">パートナーに応募する</h2><p className="plp-lead">ご入力のうえ送信してください。担当者よりご連絡いたします。</p></div>
              <form className="plp-form" onSubmit={submit}>
                <label className="plp-fld"><span>お名前 <i>*</i></span><input value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" required /></label>
                <div className="plp-fld-row">
                  <label className="plp-fld"><span>会社・屋号（任意）</span><input value={org} onChange={e => setOrg(e.target.value)} placeholder="〇〇会計事務所" /></label>
                  <label className="plp-fld"><span>ご専門（任意）</span><input value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="例：税理士・経営コンサル" /></label>
                </div>
                <div className="plp-fld-row">
                  <label className="plp-fld"><span>メールアドレス</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" autoComplete="off" /></label>
                  <label className="plp-fld"><span>電話番号</span><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" /></label>
                </div>
                <label className="plp-fld"><span>ひとこと（任意）</span><input value={message} onChange={e => setMessage(e.target.value)} placeholder="例：顧問先からの相談が増えています など" /></label>
                <label className="plp-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>株式会社Media Birth からのご連絡に同意します。いただいた情報はご案内のためにのみ使用します。</span></label>
                {err && <p className="plp-err">{err}</p>}
                <button className="plp-submit" type="submit" disabled={busy}>{busy ? '送信中…' : 'パートナーに応募する'}</button>
              </form>
            </>
          )}
        </div>
      </section>

      <footer className="plp-footer">
        <span className="plp-wordmark sm">MB <span>Partners</span></span>
        <div className="plp-foot-meta">株式会社Media Birth ・ <a href="/legal/privacy">プライバシーポリシー</a></div>
      </footer>
    </div>
  )
}

const CSS = `
/* タイポ設計: 8px余白グリッド・1.25モジュラースケール・見出し字間-0.045em/行間1.02・本文行間1.85で呼吸。 */
.plp{--ink:#17161f;--ink2:#524f5d;--mut:#8b8894;--line:#eceaf3;--bg:#fbfbfd;--card:#fff;--indigo:#5646e6;--indigo2:#7c6cf0;
  background:var(--bg);color:var(--ink);font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
.plp *{box-sizing:border-box;margin:0;}
.plp-rise{opacity:0;transform:translateY(26px);transition:opacity 1.05s cubic-bezier(.19,.7,.2,1),transform 1.05s cubic-bezier(.19,.7,.2,1);}
.plp-rise.in{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.plp-rise{opacity:1;transform:none;transition:none;}}

.plp-hero{position:relative;min-height:100svh;display:flex;overflow:hidden;background:radial-gradient(120% 92% at 80% 6%,#f1eefe 0%,#fbfbfd 54%);}
.plp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;transform:translateY(calc(var(--plp-py,0)*0.14px));opacity:calc(1 - var(--plp-py,0)*0.0011));}
.plp-hero-inner{position:relative;z-index:2;width:100%;max-width:1180px;margin:0 auto;padding:32px 32px 48px;display:flex;flex-direction:column;transform:translateY(calc(var(--plp-py,0)*-0.05px));}
.plp-nav{display:flex;align-items:center;justify-content:space-between;}
.plp-wordmark{font-weight:800;font-size:1.06rem;letter-spacing:-.02em;color:var(--ink);}
.plp-wordmark span{color:var(--indigo);}
.plp-wordmark.sm{font-size:.92rem;}
.plp-navcta{background:var(--ink);color:#fff;border:none;border-radius:999px;padding:9px 21px;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer;transition:transform .18s,background .2s;}
.plp-navcta:hover{transform:translateY(-1px);background:#000;}
.plp-hero-body{margin:auto 0;max-width:900px;}
.plp-kicker{display:inline-block;font-size:.7rem;font-weight:700;letter-spacing:.28em;color:var(--indigo);text-transform:uppercase;margin-bottom:26px;}
.plp-h1{font-size:clamp(2.9rem,8.4vw,6.2rem);font-weight:800;line-height:1.03;letter-spacing:-.045em;color:var(--ink);}
.plp-quote{color:var(--indigo);}
.plp-h1 em{font-style:normal;background:linear-gradient(100deg,#5646e6,#8a6cf5 55%,#b0a4f8);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-sub{margin-top:30px;font-size:clamp(1rem,2.1vw,1.3rem);line-height:1.85;color:var(--ink2);max-width:660px;}
.plp-sub b{color:var(--ink);font-weight:700;}
.plp-cta-row{margin-top:42px;display:flex;align-items:center;gap:22px;flex-wrap:wrap;}
.plp-cta{display:inline-flex;align-items:center;gap:10px;background:var(--indigo);color:#fff;border:none;border-radius:999px;padding:17px 32px;font:inherit;font-size:1.02rem;font-weight:700;cursor:pointer;box-shadow:0 14px 42px rgba(86,70,230,.3);transition:transform .2s,box-shadow .2s;}
.plp-cta:hover{transform:translateY(-3px);box-shadow:0 22px 58px rgba(86,70,230,.44);}
.plp-arrow{transition:transform .22s;}
.plp-cta:hover .plp-arrow{transform:translateX(5px);}
.plp-cta-note{font-size:.76rem;color:var(--mut);}
.plp-scrollhint{display:flex;align-items:center;gap:12px;margin-top:38px;font-size:.6rem;letter-spacing:.4em;color:var(--mut);}
.plp-sh-line{width:34px;height:1px;background:var(--mut);transform-origin:left;animation:plpline 2.4s ease-in-out infinite;}
@keyframes plpline{0%,100%{transform:scaleX(.4);opacity:.4}50%{transform:scaleX(1);opacity:1}}

.plp-sec{position:relative;padding:clamp(80px,12vw,168px) 0;}
.plp-sec-alt{background:linear-gradient(180deg,#f6f5fc,#fbfbfd);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.plp-wrap{width:100%;max-width:1180px;margin:0 auto;padding:0 32px;}
.plp-head{margin-bottom:56px;}
.plp-kicker2{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.24em;color:var(--indigo);text-transform:uppercase;margin-bottom:18px;}
.plp-h2{font-size:clamp(1.75rem,4.6vw,3.15rem);font-weight:800;line-height:1.16;letter-spacing:-.04em;color:var(--ink);}
.plp-accent{background:linear-gradient(100deg,#5646e6,#8a6cf5);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-lead{margin-top:18px;font-size:clamp(.95rem,1.9vw,1.14rem);line-height:1.85;color:var(--ink2);max-width:620px;}
.plp-fine{margin-top:30px;font-size:.72rem;color:var(--mut);line-height:1.75;}

.plp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.plp-step{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:34px 30px;box-shadow:0 2px 22px rgba(30,25,60,.03);transition:border-color .35s,transform .35s,box-shadow .35s,opacity 1.05s cubic-bezier(.19,.7,.2,1);}
.plp-step:hover{border-color:rgba(124,108,240,.42);transform:translateY(-5px);box-shadow:0 24px 54px rgba(86,70,230,.11);}
.plp-step-top{display:flex;align-items:center;justify-content:space-between;}
.plp-step-ic{display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:15px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:var(--indigo);border:1px solid #e7e3fb;}
.plp-step-n{font-size:1rem;font-weight:800;letter-spacing:.06em;color:#cdc7e8;font-variant-numeric:tabular-nums;}
.plp-step-t{margin-top:22px;font-size:1.34rem;font-weight:700;color:var(--ink);letter-spacing:-.025em;}
.plp-step-d{margin-top:13px;font-size:.92rem;line-height:1.85;color:var(--ink2);}

.plp-rewards{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.plp-reward{position:relative;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:36px 32px;overflow:hidden;box-shadow:0 2px 22px rgba(30,25,60,.03);transition:transform .35s,box-shadow .35s,border-color .35s,opacity 1.05s cubic-bezier(.19,.7,.2,1);}
.plp-reward:hover{transform:translateY(-4px);box-shadow:0 22px 50px rgba(86,70,230,.1);border-color:rgba(124,108,240,.35);}
.plp-reward::before{content:'';position:absolute;top:-34%;right:-26%;width:180px;height:180px;background:radial-gradient(circle,rgba(124,108,240,.14),transparent 70%);}
.plp-reward-ic{position:relative;display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:14px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:var(--indigo);border:1px solid #e7e3fb;margin-bottom:22px;}
.plp-reward-k{font-size:.82rem;font-weight:700;letter-spacing:.05em;color:var(--mut);position:relative;}
.plp-reward-v{margin-top:11px;font-size:1.95rem;font-weight:800;letter-spacing:-.035em;color:var(--ink);font-variant-numeric:tabular-nums;position:relative;}
.plp-reward-d{margin-top:15px;font-size:.86rem;line-height:1.85;color:var(--ink2);position:relative;}

.plp-brands{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
.plp-brand{display:flex;flex-direction:column;gap:10px;padding:30px 26px;border:1px solid var(--line);border-radius:20px;background:var(--card);box-shadow:0 2px 22px rgba(30,25,60,.03);transition:transform .35s,box-shadow .35s,border-color .35s,opacity 1.05s cubic-bezier(.19,.7,.2,1);}
.plp-brand:hover{transform:translateY(-4px);box-shadow:0 18px 44px rgba(86,70,230,.1);border-color:rgba(124,108,240,.35);}
.plp-brand-ic{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:var(--indigo);border:1px solid #e7e3fb;margin-bottom:6px;}
.plp-brand-b{font-size:1.22rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.plp-brand-d{font-size:.77rem;color:var(--mut);}

.plp-exp{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
.plp-exp-list{list-style:none;display:flex;flex-direction:column;gap:14px;}
.plp-exp-list li{display:flex;gap:16px;align-items:center;font-size:1.02rem;line-height:1.6;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:0 2px 16px rgba(30,25,60,.03);transition:transform .3s,box-shadow .3s,opacity 1.05s cubic-bezier(.19,.7,.2,1);}
.plp-exp-list li:hover{transform:translateX(4px);box-shadow:0 12px 32px rgba(86,70,230,.09);}
.plp-exp-ic{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:var(--indigo);border:1px solid #e7e3fb;}

.plp-apply{background:radial-gradient(120% 82% at 50% 0%,#efecfc,transparent 58%);}
.plp-form-wrap{max-width:720px;}
.plp-form-head{text-align:center;margin-bottom:44px;}
.plp-form-head .plp-lead{margin-left:auto;margin-right:auto;}
.plp-form{display:flex;flex-direction:column;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:26px;padding:clamp(28px,4vw,44px);box-shadow:0 24px 64px rgba(30,25,60,.08);}
.plp-fld-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.plp-fld{display:flex;flex-direction:column;gap:8px;}
.plp-fld>span{font-size:.74rem;font-weight:600;color:var(--ink2);}
.plp-fld>span i{color:var(--indigo);font-style:normal;}
.plp-fld input{width:100%;min-height:50px;background:#fcfcfe;border:1px solid #e4e1ee;border-radius:12px;padding:0 15px;color:var(--ink);font:inherit;font-size:.95rem;transition:border-color .18s,box-shadow .18s,background .18s;}
.plp-fld input::placeholder{color:#b3b0bf;}
.plp-fld input:focus{outline:none;border-color:var(--indigo);background:#fff;box-shadow:0 0 0 4px rgba(124,108,240,.15);}
.plp-consent{display:flex;gap:11px;align-items:flex-start;margin-top:6px;cursor:pointer;}
.plp-consent input{margin-top:3px;width:16px;height:16px;accent-color:var(--indigo);flex-shrink:0;}
.plp-consent span{font-size:.76rem;line-height:1.7;color:var(--ink2);}
.plp-err{font-size:.8rem;color:#d64545;}
.plp-submit{margin-top:8px;min-height:56px;background:var(--indigo);color:#fff;border:none;border-radius:14px;font:inherit;font-size:1.04rem;font-weight:700;cursor:pointer;box-shadow:0 14px 42px rgba(86,70,230,.3);transition:transform .18s,box-shadow .18s,opacity .18s;}
.plp-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 22px 56px rgba(86,70,230,.44);}
.plp-submit:disabled{opacity:.5;cursor:default;}
.plp-doneblock{text-align:center;padding:30px 0;}
.plp-check{width:60px;height:60px;border-radius:50%;background:var(--indigo);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 12px 34px rgba(86,70,230,.36);}
.plp-doneblock .plp-lead{margin:14px auto 0;}

.plp-footer{border-top:1px solid var(--line);padding:38px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;max-width:1180px;margin:0 auto;}
.plp-foot-meta{font-size:.72rem;color:var(--mut);}
.plp-foot-meta a{color:var(--indigo);text-decoration:none;}
.plp-foot-meta a:hover{text-decoration:underline;}

@media (max-width:820px){
  .plp-steps,.plp-rewards,.plp-brands,.plp-exp,.plp-fld-row{grid-template-columns:1fr;}
  .plp-brands{grid-template-columns:1fr 1fr;}
  .plp-exp{gap:30px;}
  .plp-hero-inner{padding:22px 22px 36px;}
  .plp-cta{width:100%;justify-content:center;}
  .plp-cta-row{gap:14px;}
  .plp-head{margin-bottom:40px;}
}
`
