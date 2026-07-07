'use client'
/**
 * パートナー募集LP v2（/partners）— ビジュアル反転: 夜→光。ページスコープ完結（グローバル無波及）。
 * 参照(モニクル)の視覚言語を「MB Partnersの光」として翻訳: 白い基調・柔らかな半透明の"つながりの網"(Canvas2D・軽量)・
 *   色数を絞ったパステル・広い余白・上品で節度あるモーション。おどろおどろしさの完全な不在。
 * 構成・全文言（正典）・応募フォーム/経路・事実の正典は初稿から不変。モバイルは低負荷・可視時のみ描画・reduced-motionで静止。
 */
import { useEffect, useRef, useState } from 'react'

// 柔らかな"つながりの網": 淡いノードが漂い、近いもの同士が細い線で結ばれる（紹介＝人をつなぐ の隠喩）。
function useNetwork(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobile = matchMedia('(max-width: 820px)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
    const N = mobile ? 20 : 40
    const LINK = mobile ? 150 : 190
    const cols = ['124,110,238', '128,205,184', '240,190,150'] // soft indigo / mint / peach
    let w = 0, h = 0
    type Node = { x: number; y: number; vx: number; vy: number; r: number; c: string }
    let nodes: Node[] = []
    const blobs = [ { x: .18, y: .22, r: .5, c: '124,110,238' }, { x: .82, y: .3, r: .55, c: '128,205,184' }, { x: .6, y: .82, r: .5, c: '240,190,150' } ]
    const seed = () => { nodes = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22, r: 1.6 + Math.random() * 2.4, c: cols[Math.floor(Math.random() * cols.length)] })) }
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); seed() }
    resize(); addEventListener('resize', resize)
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      // 大きな淡い光のにじみ（空気感）
      for (const b of blobs) { const R = b.r * Math.min(w, h); const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, R); g.addColorStop(0, `rgba(${b.c},0.10)`); g.addColorStop(1, `rgba(${b.c},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h) }
      // リンク
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; const dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy)
        if (d < LINK) { ctx.strokeStyle = `rgba(90,70,230,${(1 - d / LINK) * 0.12})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() }
      }
      // ノード（柔らかいグロー）
      for (const n of nodes) { const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5); g.addColorStop(0, `rgba(${n.c},0.9)`); g.addColorStop(.4, `rgba(${n.c},0.35)`); g.addColorStop(1, `rgba(${n.c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 5, 0, 6.2832); ctx.fill() }
    }
    const step = () => { for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < -20) n.x = w + 20; if (n.x > w + 20) n.x = -20; if (n.y < -20) n.y = h + 20; if (n.y > h + 20) n.y = -20 } }
    let raf = 0, visible = true
    const loop = () => { if (!visible || reduce) return; step(); draw(); raf = requestAnimationFrame(loop) }
    const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible && !reduce) loop() }, { threshold: 0 }); io.observe(cv)
    if (reduce) draw(); else loop()
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener('resize', resize) }
  }, [canvasRef])
}

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.12 })
    document.querySelectorAll('.plp-rise').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

export default function PartnersLP() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useNetwork(canvasRef)
  useReveal()
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [expertise, setExpertise] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) { setErr('お名前を入力してください'); return }
    if (!email.trim() && !phone.trim()) { setErr('メールか電話のいずれかをご記入ください'); return }
    if (!consent) { setErr('同意の確認をお願いします'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/partner-apply', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, org, expertise, email, phone, message, consent }) })
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
          <div className="plp-hero-body plp-rise">
            <span className="plp-kicker">紹介パートナー・プログラム</span>
            <h1 className="plp-h1">人をつなぐと、<br/><em>報酬</em>になる。</h1>
            <p className="plp-sub">知人や取引先を紹介するだけ。商談も実務も <b>株式会社Media Birth</b> が担い、成約すると報酬をお支払いします。</p>
            <div className="plp-cta-row">
              <button className="plp-cta" onClick={scrollForm}>パートナーに応募する<span className="plp-arrow">→</span></button>
              <span className="plp-cta-note">登録無料・応募制（審査があります）</span>
            </div>
          </div>
          <div className="plp-scrollhint plp-rise" aria-hidden>SCROLL</div>
        </div>
      </section>

      {/* ── 仕組み ── */}
      <section className="plp-sec">
        <div className="plp-wrap">
          <h2 className="plp-h2 plp-rise">紹介するだけ。あとは、私たちが。</h2>
          <div className="plp-steps">
            {[
              { n: '01', t: '紹介する', d: '知人・取引先をおつなぎいただきます。つなぐだけで完結するメニューもあります。' },
              { n: '02', t: 'Media Birth が動く', d: '商談も実務も、私たちが責任をもって担当します。' },
              { n: '03', t: '成約で報酬', d: '成約すると、あなたに報酬をお支払いします。進捗はアプリで見えます。' },
            ].map(s => (
              <div key={s.n} className="plp-step plp-rise">
                <span className="plp-step-n">{s.n}</span>
                <h3 className="plp-step-t">{s.t}</h3>
                <p className="plp-step-d">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 報酬 ── */}
      <section className="plp-sec plp-sec-alt">
        <div className="plp-wrap">
          <span className="plp-kicker2 plp-rise">報酬のかたち</span>
          <h2 className="plp-h2 plp-rise">メニューに応じて、3つの報酬。</h2>
          <div className="plp-rewards">
            {[
              { k: '固定報酬', v: '例：¥30,000', d: 'メニューごとに定めた固定額。成約時にお支払いします。' },
              { k: '粗利連動', v: '粗利に応じて', d: '案件の粗利に連動して報酬が決まるメニューもあります。' },
              { k: '継続型', v: '継続的に', d: '契約が続くあいだ、継続的に報酬が発生するメニューもあります。' },
            ].map(r => (
              <div key={r.k} className="plp-reward plp-rise">
                <div className="plp-reward-k">{r.k}</div>
                <div className="plp-reward-v">{r.v}</div>
                <div className="plp-reward-d">{r.d}</div>
              </div>
            ))}
          </div>
          <p className="plp-fine plp-rise">※ 金額・条件はメニューにより異なります。上記は一例で、収入を保証するものではありません。</p>
        </div>
      </section>

      {/* ── 領域 ── */}
      <section className="plp-sec">
        <div className="plp-wrap">
          <h2 className="plp-h2 plp-rise">複数の領域で、紹介できる。</h2>
          <p className="plp-lead plp-rise">不動産・人材・制作・DX支援など、複数のサービスがあります。あなたの人脈に合う領域を選べます。</p>
          <div className="plp-brands">
            {[
              { b: 'MOOM', d: '不動産・お住まい' },
              { b: 'MatchHub', d: '人材・採用' },
              { b: 'RESONATION', d: '制作・クリエイティブ' },
              { b: 'PRAGMATION', d: 'DX・業務支援' },
            ].map(x => (
              <div key={x.b} className="plp-brand plp-rise">
                <span className="plp-brand-b">{x.b}</span>
                <span className="plp-brand-d">{x.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 体験 ── */}
      <section className="plp-sec plp-sec-alt">
        <div className="plp-wrap plp-exp">
          <div className="plp-rise">
            <span className="plp-kicker2">スマホで完結</span>
            <h2 className="plp-h2">紹介リンクを送るだけ。<br/>進捗も報酬も、手のひらに。</h2>
          </div>
          <ul className="plp-exp-list plp-rise">
            {[
              'スマホアプリ（PWA）で登録から紹介・確認までを完結できます。',
              '紹介リンクを送るだけの紹介も可能です。',
              '案件の進捗・報酬・支払まで、アプリの中で見えます。',
              '登録は無料。応募制で、審査のうえパートナーとしてご案内します。',
            ].map((t, i) => <li key={i}><span className="plp-dot" />{t}</li>)}
          </ul>
        </div>
      </section>

      {/* ── 応募フォーム ── */}
      <section className="plp-sec plp-apply" id="apply">
        <div className="plp-wrap plp-form-wrap plp-rise">
          {done ? (
            <div className="plp-doneblock">
              <div className="plp-check" aria-hidden>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="plp-h2">応募を受け付けました。</h2>
              <p className="plp-lead">内容を確認のうえ、担当者よりご連絡いたします。ありがとうございます。</p>
            </div>
          ) : (
            <>
              <div className="plp-form-head">
                <h2 className="plp-h2">パートナーに応募する</h2>
                <p className="plp-lead">お名前と、メールか電話のいずれかをご記入ください。審査のうえご連絡します。</p>
              </div>
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
                <button className="plp-submit" type="submit" disabled={busy}>{busy ? '送信中…' : '応募する'}</button>
              </form>
            </>
          )}
        </div>
      </section>

      {/* ── フッター ── */}
      <footer className="plp-footer">
        <span className="plp-wordmark sm">MB <span>Partners</span></span>
        <div className="plp-foot-meta">株式会社Media Birth ・ <a href="/legal/privacy">プライバシーポリシー</a></div>
      </footer>
    </div>
  )
}

const CSS = `
.plp{--ink:#1a1922;--ink2:#565360;--mut:#8b8894;--line:#ece9f2;--bg:#fbfbfd;--card:#ffffff;--indigo:#5646e6;--indigo2:#7a6cf0;--soft:#f3f1fc;
  background:var(--bg);color:var(--ink);
  font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;
  -webkit-font-smoothing:antialiased;overflow-x:hidden;}
.plp *{box-sizing:border-box;margin:0;}
.plp-rise{opacity:0;transform:translateY(24px);transition:opacity 1s cubic-bezier(.2,.7,.2,1),transform 1s cubic-bezier(.2,.7,.2,1);}
.plp-rise.in{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.plp-rise{opacity:1;transform:none;transition:none;}}

/* HERO */
.plp-hero{position:relative;min-height:100svh;display:flex;overflow:hidden;
  background:radial-gradient(120% 90% at 78% 8%, #f2f0fd 0%, #fbfbfd 52%, #fbfbfd 100%);}
.plp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
.plp-hero-inner{position:relative;z-index:2;width:100%;max-width:1180px;margin:0 auto;padding:30px 30px 44px;display:flex;flex-direction:column;}
.plp-nav{display:flex;align-items:center;justify-content:space-between;}
.plp-wordmark{font-weight:800;font-size:1.05rem;letter-spacing:-.02em;color:var(--ink);}
.plp-wordmark span{color:var(--indigo);}
.plp-wordmark.sm{font-size:.92rem;}
.plp-navcta{background:var(--ink);color:#fff;border:none;border-radius:999px;padding:9px 20px;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer;transition:transform .18s,background .2s;}
.plp-navcta:hover{transform:translateY(-1px);background:#000;}
.plp-hero-body{margin:auto 0;max-width:860px;}
.plp-kicker{display:inline-block;font-size:.7rem;font-weight:700;letter-spacing:.26em;color:var(--indigo);text-transform:uppercase;margin-bottom:24px;}
.plp-h1{font-size:clamp(2.9rem,8.8vw,6.4rem);font-weight:800;line-height:1.04;letter-spacing:-.04em;color:var(--ink);}
.plp-h1 em{font-style:normal;background:linear-gradient(100deg,#5646e6,#8a6cf5 60%,#a99bf7);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-sub{margin-top:28px;font-size:clamp(1rem,2.1vw,1.28rem);line-height:1.8;color:var(--ink2);max-width:640px;}
.plp-sub b{color:var(--ink);font-weight:700;}
.plp-cta-row{margin-top:40px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
.plp-cta{display:inline-flex;align-items:center;gap:10px;background:var(--indigo);color:#fff;border:none;border-radius:999px;padding:16px 30px;font:inherit;font-size:1rem;font-weight:700;cursor:pointer;box-shadow:0 14px 40px rgba(86,70,230,.28);transition:transform .18s,box-shadow .18s;}
.plp-cta:hover{transform:translateY(-2px);box-shadow:0 20px 52px rgba(86,70,230,.4);}
.plp-arrow{transition:transform .2s;}
.plp-cta:hover .plp-arrow{transform:translateX(4px);}
.plp-cta-note{font-size:.76rem;color:var(--mut);}
.plp-scrollhint{align-self:flex-start;margin-top:34px;font-size:.6rem;letter-spacing:.4em;color:var(--mut);animation:plpbob 2.2s ease-in-out infinite;}
@keyframes plpbob{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(6px);opacity:1}}

/* SECTIONS */
.plp-sec{position:relative;padding:clamp(76px,11vw,156px) 0;}
.plp-sec-alt{background:linear-gradient(180deg,#f6f5fc,#fbfbfd);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.plp-wrap{width:100%;max-width:1180px;margin:0 auto;padding:0 30px;}
.plp-kicker2{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.22em;color:var(--indigo);text-transform:uppercase;margin-bottom:16px;}
.plp-h2{font-size:clamp(1.7rem,4.4vw,3.05rem);font-weight:800;line-height:1.18;letter-spacing:-.035em;color:var(--ink);}
.plp-lead{margin-top:16px;font-size:clamp(.94rem,1.9vw,1.12rem);line-height:1.85;color:var(--ink2);max-width:620px;}
.plp-fine{margin-top:28px;font-size:.72rem;color:var(--mut);line-height:1.75;}

.plp-steps{margin-top:54px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.plp-step{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:32px 28px;box-shadow:0 2px 20px rgba(30,25,60,.03);transition:border-color .3s,transform .3s,box-shadow .3s;}
.plp-step:hover{border-color:rgba(122,108,240,.4);transform:translateY(-4px);box-shadow:0 20px 48px rgba(86,70,230,.1);}
.plp-step-n{font-size:.82rem;font-weight:800;letter-spacing:.1em;color:var(--indigo);}
.plp-step-t{margin-top:18px;font-size:1.3rem;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
.plp-step-d{margin-top:12px;font-size:.9rem;line-height:1.85;color:var(--ink2);}

.plp-rewards{margin-top:48px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.plp-reward{position:relative;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:36px 30px;overflow:hidden;box-shadow:0 2px 20px rgba(30,25,60,.03);}
.plp-reward::before{content:'';position:absolute;top:-30%;right:-24%;width:170px;height:170px;background:radial-gradient(circle,rgba(122,108,240,.16),transparent 70%);}
.plp-reward-k{font-size:.82rem;font-weight:700;letter-spacing:.06em;color:var(--mut);}
.plp-reward-v{margin-top:12px;font-size:1.92rem;font-weight:800;letter-spacing:-.03em;color:var(--ink);font-variant-numeric:tabular-nums;}
.plp-reward-d{margin-top:14px;font-size:.86rem;line-height:1.85;color:var(--ink2);position:relative;}

.plp-brands{margin-top:48px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.plp-brand{display:flex;flex-direction:column;gap:8px;padding:28px 24px;border:1px solid var(--line);border-radius:18px;background:var(--card);transition:border-color .3s,transform .3s,box-shadow .3s;}
.plp-brand:hover{border-color:rgba(122,108,240,.4);transform:translateY(-3px);box-shadow:0 16px 40px rgba(86,70,230,.09);}
.plp-brand-b{font-size:1.2rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.plp-brand-d{font-size:.76rem;color:var(--mut);}

.plp-exp{display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:center;}
.plp-exp-list{list-style:none;display:flex;flex-direction:column;gap:20px;}
.plp-exp-list li{display:flex;gap:14px;font-size:1rem;line-height:1.7;color:var(--ink2);}
.plp-exp-list li .plp-dot{flex-shrink:0;width:9px;height:9px;border-radius:50%;margin-top:8px;background:linear-gradient(135deg,#7a6cf0,#5646e6);box-shadow:0 0 0 4px rgba(122,108,240,.14);}

/* FORM */
.plp-apply{background:radial-gradient(120% 80% at 50% 0%,#f0edfc,transparent 60%);}
.plp-form-wrap{max-width:720px;}
.plp-form-head{text-align:center;margin-bottom:40px;}
.plp-form-head .plp-lead{margin-left:auto;margin-right:auto;}
.plp-form{display:flex;flex-direction:column;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:clamp(26px,4vw,42px);box-shadow:0 20px 60px rgba(30,25,60,.07);}
.plp-fld-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.plp-fld{display:flex;flex-direction:column;gap:8px;}
.plp-fld>span{font-size:.74rem;font-weight:600;color:var(--ink2);}
.plp-fld>span i{color:var(--indigo);font-style:normal;}
.plp-fld input{width:100%;min-height:50px;background:#fcfcfe;border:1px solid #e4e1ee;border-radius:12px;padding:0 15px;color:var(--ink);font:inherit;font-size:.95rem;transition:border-color .18s,box-shadow .18s,background .18s;}
.plp-fld input::placeholder{color:#b3b0bf;}
.plp-fld input:focus{outline:none;border-color:var(--indigo);background:#fff;box-shadow:0 0 0 4px rgba(122,108,240,.14);}
.plp-consent{display:flex;gap:11px;align-items:flex-start;margin-top:6px;cursor:pointer;}
.plp-consent input{margin-top:3px;width:16px;height:16px;accent-color:var(--indigo);flex-shrink:0;}
.plp-consent span{font-size:.76rem;line-height:1.7;color:var(--ink2);}
.plp-err{font-size:.8rem;color:#d64545;}
.plp-submit{margin-top:8px;min-height:54px;background:var(--indigo);color:#fff;border:none;border-radius:13px;font:inherit;font-size:1.02rem;font-weight:700;cursor:pointer;box-shadow:0 14px 40px rgba(86,70,230,.28);transition:transform .16s,box-shadow .16s,opacity .16s;}
.plp-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 20px 52px rgba(86,70,230,.4);}
.plp-submit:disabled{opacity:.5;cursor:default;}
.plp-doneblock{text-align:center;padding:30px 0;}
.plp-check{width:60px;height:60px;border-radius:50%;background:var(--indigo);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 12px 34px rgba(86,70,230,.35);}
.plp-doneblock .plp-lead{margin:14px auto 0;}

/* FOOTER */
.plp-footer{border-top:1px solid var(--line);padding:36px 30px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;max-width:1180px;margin:0 auto;}
.plp-foot-meta{font-size:.72rem;color:var(--mut);}
.plp-foot-meta a{color:var(--indigo);text-decoration:none;}
.plp-foot-meta a:hover{text-decoration:underline;}

@media (max-width:820px){
  .plp-steps,.plp-rewards,.plp-brands,.plp-exp,.plp-fld-row{grid-template-columns:1fr;}
  .plp-brands{grid-template-columns:1fr 1fr;}
  .plp-exp{gap:28px;}
  .plp-hero-inner{padding:22px 22px 34px;}
  .plp-cta{width:100%;justify-content:center;}
  .plp-cta-row{gap:14px;}
}
`
