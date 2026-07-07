'use client'
/**
 * パートナー募集LP（/partners）— 一発勝負・ページスコープ完結（グローバル無波及）。
 * ビジュアル: 生WebGL(依存なし)のドメインワーピングFBMネビュラ＋シナプス紋章。モバイルは低解像度・可視時のみ描画・reduced-motionで静止。
 * 事実の正典のみ・虚偽/創作数字なし。応募は既存 /api/partner-apply（partner_applications）へ接続。
 */
import { useEffect, useRef, useState } from 'react'

const FRAG = `
precision highp float;
uniform vec2 u_res; uniform float u_time;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.02; a*=0.5; } return v; }
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*u_res)/u_res.y;
  float t=u_time*0.045;
  vec2 q=vec2(fbm(uv*1.4+t), fbm(uv*1.4+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(uv*1.4+3.4*q+vec2(1.7,9.2)+0.15*t), fbm(uv*1.4+3.4*q+vec2(8.3,2.8)-0.126*t));
  float f=fbm(uv*1.4+3.6*r);
  vec3 ink=vec3(0.022,0.018,0.050);
  vec3 indigo=vec3(0.19,0.12,0.72);
  vec3 violet=vec3(0.54,0.37,1.0);
  float m=clamp(f*f*1.95-0.10, 0.0, 1.0);
  vec3 col=mix(ink, indigo, m);
  col=mix(col, violet, clamp((length(r)-0.34)*1.15, 0.0, 1.0));
  col+=0.11*pow(clamp(f,0.0,1.0),4.0)*vec3(0.82,0.86,1.25);
  col*=1.0-0.62*dot(uv,uv);
  col=pow(col, vec3(0.92));
  gl_FragColor=vec4(col,1.0);
}`
const VERT = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.0,1.0); }`

function useNebula(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
    if (!gl) { cv.style.background = 'radial-gradient(120% 90% at 70% 10%, #2a1f80 0%, #120e2e 55%, #08060f 100%)'; return }
    const isMobile = matchMedia('(max-width: 820px)').matches
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const scale = isMobile ? 0.5 : 0.82
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()!; gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'u_res'); const uTime = gl.getUniformLocation(prog, 'u_time')
    let w = 0, h = 0
    const resize = () => { w = Math.floor(cv.clientWidth * scale); h = Math.floor(cv.clientHeight * scale); cv.width = w; cv.height = h; gl.viewport(0, 0, w, h) }
    resize(); addEventListener('resize', resize)
    let raf = 0, visible = true, start = performance.now()
    const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible && !reduce) loop() }, { threshold: 0 }); io.observe(cv)
    const draw = (tms: number) => { gl.uniform2f(uRes, w, h); gl.uniform1f(uTime, (tms - start) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3) }
    const loop = () => { if (!visible || reduce) return; draw(performance.now()); raf = requestAnimationFrame(loop) }
    if (reduce) draw(6000); else loop()
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
  useNebula(canvasRef)
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
        <div className="plp-grain" aria-hidden />
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
.plp{--pi:#5a48f0;--pi2:#8b7bff;--bg:#08060f;--ink:#f4f2fb;--mut:#a29fc0;--mut2:#6f6b8f;--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.035);
  background:var(--bg);color:var(--ink);font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN',sans-serif;
  -webkit-font-smoothing:antialiased;overflow-x:hidden;}
.plp *{box-sizing:border-box;margin:0;}
.plp-rise{opacity:0;transform:translateY(26px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1);}
.plp-rise.in{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.plp-rise{opacity:1;transform:none;transition:none;}}

/* HERO */
.plp-hero{position:relative;min-height:100svh;display:flex;overflow:hidden;}
.plp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
.plp-grain{position:absolute;inset:0;pointer-events:none;background:
  linear-gradient(96deg, rgba(6,5,13,.62) 0%, rgba(6,5,13,.28) 42%, rgba(6,5,13,0) 68%),
  radial-gradient(130% 80% at 50% 122%, rgba(6,5,13,.92), transparent 58%),
  linear-gradient(180deg, rgba(6,5,13,.28) 0%, transparent 22%);}
.plp-hero-inner{position:relative;z-index:2;width:100%;max-width:1120px;margin:0 auto;padding:26px 26px 40px;display:flex;flex-direction:column;}
.plp-nav{display:flex;align-items:center;justify-content:space-between;}
.plp-wordmark{font-weight:800;font-size:1.02rem;letter-spacing:-.01em;color:#fff;}
.plp-wordmark span{color:var(--pi2);}
.plp-wordmark.sm{font-size:.9rem;}
.plp-navcta{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:8px 18px;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer;backdrop-filter:blur(8px);transition:background .2s;}
.plp-navcta:hover{background:rgba(255,255,255,.18);}
.plp-hero-body{margin:auto 0;max-width:820px;}
.plp-kicker{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.28em;color:var(--pi2);text-transform:uppercase;margin-bottom:22px;}
.plp-h1{font-size:clamp(2.8rem,8.5vw,6.2rem);font-weight:800;line-height:1.02;letter-spacing:-.035em;color:#fff;text-shadow:0 4px 60px rgba(90,72,240,.4);}
.plp-h1 em{font-style:normal;background:linear-gradient(120deg,#8b7bff,#c9beff 60%,#fff);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-sub{margin-top:26px;font-size:clamp(1rem,2.2vw,1.28rem);line-height:1.75;color:var(--mut);max-width:640px;}
.plp-sub b{color:var(--ink);font-weight:600;}
.plp-cta-row{margin-top:38px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
.plp-cta{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(120deg,#6a58f4,#4b39d8);color:#fff;border:none;border-radius:999px;padding:16px 30px;font:inherit;font-size:1rem;font-weight:700;cursor:pointer;box-shadow:0 12px 44px rgba(90,72,240,.5);transition:transform .18s,box-shadow .18s;}
.plp-cta:hover{transform:translateY(-2px);box-shadow:0 18px 56px rgba(90,72,240,.65);}
.plp-arrow{transition:transform .2s;}
.plp-cta:hover .plp-arrow{transform:translateX(4px);}
.plp-cta-note{font-size:.76rem;color:var(--mut2);}
.plp-scrollhint{align-self:center;margin-top:30px;font-size:.6rem;letter-spacing:.4em;color:var(--mut2);animation:plpbob 2.2s ease-in-out infinite;}
@keyframes plpbob{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(6px);opacity:1}}

/* SECTIONS */
.plp-sec{position:relative;padding:clamp(72px,11vw,150px) 0;}
.plp-sec-alt{background:linear-gradient(180deg,rgba(90,72,240,.05),rgba(255,255,255,.02));border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.plp-wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 26px;}
.plp-kicker2{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.24em;color:var(--pi2);text-transform:uppercase;margin-bottom:16px;}
.plp-h2{font-size:clamp(1.7rem,4.4vw,3rem);font-weight:800;line-height:1.16;letter-spacing:-.03em;color:#fff;}
.plp-lead{margin-top:16px;font-size:clamp(.94rem,1.9vw,1.12rem);line-height:1.8;color:var(--mut);max-width:620px;}
.plp-fine{margin-top:26px;font-size:.72rem;color:var(--mut2);line-height:1.7;}

.plp-steps{margin-top:52px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.plp-step{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:30px 26px;transition:border-color .3s,transform .3s;}
.plp-step:hover{border-color:rgba(139,123,255,.4);transform:translateY(-3px);}
.plp-step-n{font-size:.82rem;font-weight:800;letter-spacing:.1em;color:var(--pi2);}
.plp-step-t{margin-top:18px;font-size:1.28rem;font-weight:700;color:#fff;}
.plp-step-d{margin-top:12px;font-size:.9rem;line-height:1.8;color:var(--mut);}

.plp-rewards{margin-top:46px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.plp-reward{position:relative;background:linear-gradient(160deg,rgba(139,123,255,.1),rgba(255,255,255,.02));border:1px solid var(--line);border-radius:18px;padding:34px 28px;overflow:hidden;}
.plp-reward::before{content:'';position:absolute;top:-40%;right:-30%;width:180px;height:180px;background:radial-gradient(circle,rgba(139,123,255,.35),transparent 70%);filter:blur(10px);}
.plp-reward-k{font-size:.82rem;font-weight:700;letter-spacing:.06em;color:var(--mut);}
.plp-reward-v{margin-top:12px;font-size:1.9rem;font-weight:800;letter-spacing:-.02em;color:#fff;font-variant-numeric:tabular-nums;}
.plp-reward-d{margin-top:14px;font-size:.86rem;line-height:1.8;color:var(--mut);position:relative;}

.plp-brands{margin-top:46px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.plp-brand{display:flex;flex-direction:column;gap:8px;padding:26px 22px;border:1px solid var(--line);border-radius:16px;background:var(--card);transition:border-color .3s,background .3s;}
.plp-brand:hover{border-color:rgba(139,123,255,.4);background:rgba(139,123,255,.06);}
.plp-brand-b{font-size:1.16rem;font-weight:800;letter-spacing:-.01em;color:#fff;}
.plp-brand-d{font-size:.76rem;color:var(--mut);}

.plp-exp{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;}
.plp-exp-list{list-style:none;display:flex;flex-direction:column;gap:20px;}
.plp-exp-list li{display:flex;gap:14px;font-size:1rem;line-height:1.7;color:var(--mut);}
.plp-exp-list li .plp-dot{flex-shrink:0;width:9px;height:9px;border-radius:50%;margin-top:8px;background:linear-gradient(135deg,#8b7bff,#5a48f0);box-shadow:0 0 12px rgba(139,123,255,.7);}

/* FORM */
.plp-apply{background:radial-gradient(120% 80% at 50% 0%,rgba(90,72,240,.16),transparent 60%);}
.plp-form-wrap{max-width:720px;}
.plp-form-head{text-align:center;margin-bottom:40px;}
.plp-form-head .plp-lead{margin-left:auto;margin-right:auto;}
.plp-form{display:flex;flex-direction:column;gap:16px;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:22px;padding:clamp(24px,4vw,40px);backdrop-filter:blur(10px);}
.plp-fld-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.plp-fld{display:flex;flex-direction:column;gap:8px;}
.plp-fld>span{font-size:.74rem;font-weight:600;color:var(--mut);}
.plp-fld>span i{color:var(--pi2);font-style:normal;}
.plp-fld input{width:100%;min-height:50px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:0 15px;color:#fff;font:inherit;font-size:.95rem;transition:border-color .18s,background .18s;}
.plp-fld input::placeholder{color:var(--mut2);}
.plp-fld input:focus{outline:none;border-color:var(--pi2);background:rgba(139,123,255,.08);box-shadow:0 0 0 4px rgba(139,123,255,.14);}
.plp-consent{display:flex;gap:11px;align-items:flex-start;margin-top:6px;cursor:pointer;}
.plp-consent input{margin-top:3px;width:16px;height:16px;accent-color:var(--pi);flex-shrink:0;}
.plp-consent span{font-size:.76rem;line-height:1.7;color:var(--mut);}
.plp-err{font-size:.8rem;color:#ff8f8f;}
.plp-submit{margin-top:8px;min-height:54px;background:linear-gradient(120deg,#6a58f4,#4b39d8);color:#fff;border:none;border-radius:12px;font:inherit;font-size:1.02rem;font-weight:700;cursor:pointer;box-shadow:0 12px 40px rgba(90,72,240,.45);transition:transform .16s,box-shadow .16s,opacity .16s;}
.plp-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 18px 52px rgba(90,72,240,.6);}
.plp-submit:disabled{opacity:.5;cursor:default;}
.plp-doneblock{text-align:center;padding:30px 0;}
.plp-check{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#6a58f4,#4b39d8);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 10px 34px rgba(90,72,240,.55);}
.plp-doneblock .plp-lead{margin:14px auto 0;}

/* FOOTER */
.plp-footer{border-top:1px solid var(--line);padding:34px 26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;max-width:1120px;margin:0 auto;}
.plp-foot-meta{font-size:.72rem;color:var(--mut2);}
.plp-foot-meta a{color:var(--pi2);text-decoration:none;}
.plp-foot-meta a:hover{text-decoration:underline;}

@media (max-width:820px){
  .plp-steps,.plp-rewards,.plp-brands,.plp-exp,.plp-fld-row{grid-template-columns:1fr;}
  .plp-brands{grid-template-columns:1fr 1fr;}
  .plp-exp{gap:28px;}
  .plp-hero-inner{padding:20px 20px 32px;}
  .plp-cta{width:100%;justify-content:center;}
  .plp-cta-row{gap:14px;}
}
`
