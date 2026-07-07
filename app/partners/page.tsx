'use client'
/**
 * パートナー募集LP v5 — ページ全体にガラス浮遊オブジェクト＋モーション。ページスコープ（three は /partners のみ動的import）。
 * 3Dは固定フルページ層(pointer-events:none)。オブジェクトはスクロールに連動して全セクションを流れる＋各々が浮遊/回転＋マウス3°パララックス。
 * コンテンツはフロストガラス（backdrop-blur）で3Dを透かしつつ可読。コピーは削ぎ落とし。desktop=transmissionガラス／mobile=軽量フロスト。
 * 事実の正典・創作数字禁止。応募は既存 /api/partner-apply(partner_applications)。
 */
import { useEffect, useRef, useState } from 'react'

const K = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const ICONS: Record<string, React.ReactNode> = {
  intro: <><circle cx="6.5" cy="15" r="3" {...K} /><circle cx="17.5" cy="9" r="3" {...K} /><path d="M9 13.6l6-3.2" {...K} /><path d="M18.4 15.5l3 .6-.6 3" {...K} /><path d="M14.5 18.5c2.4 1.6 5.2 1 6.9-2.4" {...K} /></>,
  handle: <><path d="M12 3l7 3v6c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6z" {...K} /><path d="M9 12.2l2.2 2.2L15.2 10" {...K} /></>,
  reward: <><circle cx="12" cy="13.5" r="6.5" {...K} /><path d="M12 10.6v5.8M9.8 11.8h4.4M9.8 14h4.4" {...K} /><path d="M12 4.2v2.2M8.5 5l1 1.9M15.5 5l-1 1.9" {...K} /></>,
  fixed: <><rect x="5.5" y="7.5" width="13" height="10" rx="2" {...K} /><circle cx="12" cy="12.5" r="2.4" {...K} /><path d="M8 4.5l2.5 3M16 4.5l-2.5 3" {...K} /></>,
  perf: <><path d="M4 20h16" {...K} /><rect x="5.5" y="13" width="3" height="5" rx="1" {...K} /><rect x="10.5" y="9" width="3" height="9" rx="1" {...K} /><rect x="15.5" y="5" width="3" height="13" rx="1" {...K} /></>,
  recur: <><path d="M6 8.5A7 7 0 0 1 19 11" {...K} /><path d="M18 8.5V11h-2.5" {...K} /><path d="M18 15.5A7 7 0 0 1 5 13" {...K} /><path d="M6 15.5V13h2.5" {...K} /></>,
  phone: <><rect x="7" y="3.5" width="10" height="17" rx="2.4" {...K} /><path d="M10.5 6h3" {...K} /><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" /></>,
  apply: <><path d="M6 4.5h8l4 4V19.5H6z" {...K} /><path d="M14 4.5V9h4" {...K} /><path d="M9 13h6M9 16h4" {...K} /></>,
  home: <><path d="M5 11.5L12 5l7 6.5" {...K} /><path d="M7 10.5V19h10v-8.5" {...K} /><path d="M10.5 19v-4h3v4" {...K} /></>,
  people: <><circle cx="8" cy="9" r="2.6" {...K} /><circle cx="16" cy="9" r="2.6" {...K} /><path d="M3.8 18c.4-2.6 2.2-4 4.2-4s3.8 1.4 4.2 4" {...K} /><path d="M11.8 18c.4-2.6 2.2-4 4.2-4s3.8 1.4 4.2 4" {...K} /></>,
  create: <><path d="M4 18c3-1 4-4 3.5-7C11 9 14 6 19 5c-.6 5-3.4 8.2-7 9.2C9 15 6.6 16.2 4 18z" {...K} /><path d="M8 14.5l2 2" {...K} /></>,
  dx: <><circle cx="6" cy="7" r="2" {...K} /><circle cx="18" cy="7" r="2" {...K} /><circle cx="12" cy="17" r="2" {...K} /><path d="M7.5 8.5l3.5 6.8M16.5 8.5L13 15.3M8 7h8" {...K} /></>,
}
const Ic = ({ n }: { n: string }) => <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>{ICONS[n]}</svg>

// ── ページ全体のガラス3D層（動的import・全セクションにオブジェクトが流れる） ──
function useScene(mountRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = mountRef.current; if (!el) return
    let dispose = () => {}; let cancelled = false
    import('three').then((THREE) => {
      if (cancelled) return
      const mobile = matchMedia('(max-width: 820px)').matches
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      const W = () => innerWidth, H = () => innerHeight
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.4 : 1.75))
      renderer.setSize(W(), H()); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15
      el.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 100); camera.position.set(0, 0, 9)

      const eq = document.createElement('canvas'); eq.width = 512; eq.height = 256; const g = eq.getContext('2d')!
      const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#eae6ff'); grd.addColorStop(.4, '#fff'); grd.addColorStop(.7, '#e6f6ef'); grd.addColorStop(1, '#ffeede')
      g.fillStyle = grd; g.fillRect(0, 0, 512, 256)
      const rg = (x: number, y: number, r: number, c: string) => { const rr = g.createRadialGradient(x, y, 0, x, y, r); rr.addColorStop(0, c); rr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rr; g.fillRect(0, 0, 512, 256) }
      rg(120, 70, 150, 'rgba(150,140,255,.62)'); rg(400, 90, 160, 'rgba(140,220,190,.56)'); rg(300, 210, 160, 'rgba(255,195,150,.56)')
      const envTex = new THREE.CanvasTexture(eq); envTex.mapping = THREE.EquirectangularReflectionMapping
      const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(envTex).texture
      scene.environment = env; envTex.dispose(); pmrem.dispose()

      const mat = (tint?: number) => mobile
        ? new THREE.MeshPhysicalMaterial({ transmission: 0, roughness: 0.28, metalness: 0, color: 0xffffff, envMapIntensity: 1.6, clearcoat: 0.6, clearcoatRoughness: 0.35, transparent: true, opacity: 0.62 })
        : new THREE.MeshPhysicalMaterial({ transmission: 1, ior: 1.2, thickness: 1.1, roughness: 0.22, metalness: 0, color: 0xffffff, envMapIntensity: 1.1, clearcoat: 0.5, clearcoatRoughness: 0.3, transparent: true, ...(tint ? { attenuationColor: new THREE.Color(tint), attenuationDistance: 2.4 } : {}) })

      const group = new THREE.Group(); scene.add(group)
      const shTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const cx = c.getContext('2d')!; const rr = cx.createRadialGradient(64, 64, 0, 64, 64, 64); rr.addColorStop(0, 'rgba(60,50,90,.20)'); rr.addColorStop(1, 'rgba(60,50,90,0)'); cx.fillStyle = rr; cx.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c) })()
      type O = { m: THREE.Mesh; ph: number; sp: number; amp: number; rot: number }
      const objs: O[] = []
      const geoFor = (k: string): THREE.BufferGeometry => k === 'sphere' ? new THREE.SphereGeometry(1, mobile ? 40 : 64, mobile ? 40 : 64) : k === 'torus' ? new THREE.TorusGeometry(0.9, 0.34, mobile ? 24 : 40, mobile ? 60 : 90) : k === 'box' ? new THREE.BoxGeometry(1.7, 1.7, 0.32) : k === 'ico' ? new THREE.IcosahedronGeometry(0.75, 0) : new THREE.TorusKnotGeometry(0.62, 0.2, 90, 14)
      // section毎に配置（worldY = 3 - 7*section）。desktop=各2〜3 / mobile=間引き。
      const SEC = 7
      const defs: [string, number, number, number, number, number][] = [
        // [geo, section, x, z, scale, tint]
        ['sphere', 0, -3.3, -0.5, 0.95, 0xbfe9d8], ['torus', 0, 2.7, 0.4, 0.95, 0xccc4ff], ['ico', 0, 0.4, 1.5, 0.7, 0xffe0cc],
        ['box', 1, -3.0, 0.6, 0.78, 0xd7f0ff], ['sphere', 1, 3.1, -1.0, 0.72, 0xffd9bf],
        ['torus', 2, -3.2, -0.4, 0.8, 0xbfe9d8], ['ico', 2, 3.0, 0.8, 0.72, 0xccc4ff],
        ['knot', 3, -2.9, 0.3, 0.8, 0xffe0cc], ['sphere', 3, 3.2, -0.6, 0.82, 0xd7f0ff],
        ['box', 4, -3.1, -0.3, 0.72, 0xccc4ff], ['torus', 4, 3.0, 0.5, 0.82, 0xffd9bf],
        ['ico', 5, -2.8, 0.6, 0.72, 0xbfe9d8], ['sphere', 5, 3.1, -0.8, 0.78, 0xffe0cc],
      ]
      const use = mobile ? defs.filter((_, i) => i % 2 === 0 || i < 3) : defs
      for (const [k, sec, x, z, s, tint] of use) {
        const m = new THREE.Mesh(geoFor(k), mat(tint)); const wy = 3 - SEC * sec + (Math.random() - .5) * 1.4
        m.position.set(x, wy, z); m.scale.setScalar(s); group.add(m)
        objs.push({ m, ph: Math.random() * 6.28, sp: 0.45 + Math.random() * 0.5, amp: 0.13 + Math.random() * 0.08, rot: (Math.random() - .5) * 0.006 })
        if (!mobile) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: shTex, transparent: true, depthWrite: false })); sp.scale.set(2.3 * s, 0.95 * s, 1); sp.position.set(x, wy - 1.5 * s, z - 0.2); group.add(sp) }
      }
      const SPREAD = SEC * 5
      let targetGY = 0, gy = 0
      const onScroll = () => { const max = Math.max(1, document.body.scrollHeight - innerHeight); targetGY = (scrollY / max) * SPREAD }
      addEventListener('scroll', onScroll, { passive: true }); onScroll()
      const mouse = { x: 0, y: 0 }
      if (!mobile && !reduce) addEventListener('pointermove', e => { mouse.x = (e.clientX / innerWidth - .5) * 2; mouse.y = (e.clientY / innerHeight - .5) * 2 })
      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()) }
      addEventListener('resize', onResize)
      const RAD = Math.PI / 180; const clock = new THREE.Clock(); let raf = 0
      const frame = () => {
        gy += (targetGY - gy) * 0.08; group.position.y = gy
        if (!reduce) { const t = clock.getElapsedTime(); for (const o of objs) { o.m.position.y += Math.sin(t * o.sp + o.ph) * o.amp * 0.016; o.m.rotation.x += o.rot; o.m.rotation.y += o.rot * 0.8 } ; group.rotation.y += (mouse.x * 3 * RAD - group.rotation.y) * 0.05; group.rotation.x += (mouse.y * 3 * RAD - group.rotation.x) * 0.05 }
        renderer.render(scene, camera); raf = requestAnimationFrame(frame)
      }
      frame()
      dispose = () => { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); renderer.dispose(); env.dispose(); el.contains(renderer.domElement) && el.removeChild(renderer.domElement) }
    }).catch(() => {})
    return () => { cancelled = true; dispose() }
  }, [mountRef])
}

function useMotion() {
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const el = e.target as HTMLElement; el.classList.add('in'); el.querySelectorAll<HTMLElement>('[data-st]').forEach((c, i) => { c.style.transitionDelay = `${i * 70}ms`; c.classList.add('in') }); if (el.classList.contains('plp-steps')) el.classList.add('seq'); io.unobserve(el) } }), { threshold: 0.16 })
    document.querySelectorAll('.plp-io').forEach(el => io.observe(el)); return () => io.disconnect()
  }, [])
}
function useCountUp(ref: React.RefObject<HTMLElement | null>, target: number, prefix = '') {
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = prefix + target.toLocaleString(); return }
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { const st = performance.now(); const f = (n: number) => { const p = Math.min(1, (n - st) / 900); el.textContent = prefix + Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(f) }; requestAnimationFrame(f); io.disconnect() } }, { threshold: 0.6 }); io.observe(el); return () => io.disconnect()
  }, [ref, target, prefix])
}
function useSticky() { const [on, setOn] = useState(false); useEffect(() => { const h = () => setOn(scrollY > 40); addEventListener('scroll', h, { passive: true }); h(); return () => removeEventListener('scroll', h) }, []); return on }

const Logo = () => (<svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden><rect x="6" y="6" width="14" height="14" rx="3" stroke="#5646e6" strokeWidth="3.4" /><rect x="28" y="6" width="14" height="14" rx="7" stroke="#5646e6" strokeWidth="3.4" /><rect x="6" y="28" width="14" height="14" rx="7" stroke="#17161f" strokeWidth="3.4" /><rect x="28" y="28" width="14" height="14" rx="3" fill="#5646e6" /></svg>)

export default function PartnersLP() {
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const yenRef = useRef<HTMLSpanElement | null>(null)
  useScene(sceneRef); useMotion(); useCountUp(yenRef, 30000, '¥')
  const sticky = useSticky()
  const [name, setName] = useState(''); const [org, setOrg] = useState(''); const [expertise, setExpertise] = useState('')
  const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) { setErr('お名前を入力してください'); return }
    if (!email.trim() && !phone.trim()) { setErr('メールか電話のいずれかをご記入ください'); return }
    if (!consent) { setErr('同意の確認をお願いします'); return }
    setBusy(true)
    try { const res = await fetch('/api/partner-apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, org, expertise, email, phone, message, consent }) }); const d = await res.json().catch(() => ({})); if (!res.ok) { setErr(d.error ?? '送信に失敗しました。時間をおいて再度お試しください。'); return } setDone(true) } catch { setErr('送信に失敗しました。時間をおいて再度お試しください。') } finally { setBusy(false) }
  }
  const scrollForm = () => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="plp">
      <style>{CSS}</style>
      <div className="plp-bg" aria-hidden />
      <div ref={sceneRef} className="plp-scene" aria-hidden />

      <header className={`plp-hd${sticky ? ' on' : ''}`}>
        <a href="#top" className="plp-hd-logo"><Logo /><b>MB <span>Partners</span></b></a>
        <button className="plp-hd-cta" onClick={scrollForm}>応募する</button>
      </header>

      <main className="plp-main">
        {/* HERO */}
        <section className="plp-hero" id="top">
          <div className="plp-hero-body plp-io">
            <h1 className="plp-h1"><span className="plp-line" data-st><span className="plp-quote">「つながり」</span>という資産を、</span><span className="plp-line" data-st><em>運用する。</em></span></h1>
            <p className="plp-sub" data-st>ご紹介いただくだけ。あとは、すべて私たちが。</p>
            <div className="plp-cta-row" data-st>
              <button className="plp-cta" onClick={scrollForm}>パートナーに応募する<span className="plp-arrow">→</span></button>
              <span className="plp-cta-note">登録無料・審査あり</span>
            </div>
          </div>
        </section>

        {/* はじめかた */}
        <section className="plp-sec">
          <div className="plp-wrap">
            <h2 className="plp-h2 plp-io" data-st>3ステップ。あとは、私たちが。</h2>
            <div className="plp-steps plp-io">
              {[
                { n: '01', ic: 'intro', t: '紹介する', d: 'アプリからご紹介。リンクを送るだけでも。' },
                { n: '02', ic: 'handle', t: 'Media Birthが対応', d: '商談も実務も、すべて当社が。' },
                { n: '03', ic: 'reward', t: '成約で報酬', d: '成約が確定すると、報酬に。' },
              ].map((s) => (
                <div key={s.n} className="plp-card plp-step" data-st>
                  <div className="plp-step-top"><span className="plp-ic"><Ic n={s.ic} /></span><span className="plp-step-n">{s.n}</span></div>
                  <h3 className="plp-ct">{s.t}</h3><p className="plp-cd">{s.d}</p>
                </div>
              ))}
              <span className="plp-thread" aria-hidden />
            </div>
          </div>
        </section>

        {/* 報酬 */}
        <section className="plp-sec">
          <div className="plp-wrap">
            <h2 className="plp-h2 plp-io" data-st>報酬は、3つのかたち。</h2>
            <div className="plp-rewards plp-io">
              <div className="plp-card plp-reward" data-st><span className="plp-ic"><Ic n="fixed" /></span><div className="plp-rk">固定報酬</div><div className="plp-rv"><span className="plp-vl">例：</span><span ref={yenRef} className="tnum">¥30,000</span></div><div className="plp-cd">成約時にお支払い。</div></div>
              <div className="plp-card plp-reward" data-st><span className="plp-ic"><Ic n="perf" /></span><div className="plp-rk">成果連動</div><div className="plp-rv">粗利に応じて</div><div className="plp-cd">粗利に連動するメニューも。</div></div>
              <div className="plp-card plp-reward" data-st><span className="plp-ic"><Ic n="recur" /></span><div className="plp-rk">継続報酬</div><div className="plp-rv">毎月つづく</div><div className="plp-cd">続くあいだ、継続的に。</div></div>
            </div>
            <p className="plp-fine plp-io" data-st>※ 金額・条件はメニューにより異なります。一例で、収入を保証するものではありません。</p>
          </div>
        </section>

        {/* 領域 */}
        <section className="plp-sec">
          <div className="plp-wrap">
            <h2 className="plp-h2 plp-io" data-st>4つの領域。</h2>
            <div className="plp-brands plp-io">
              {[{ ic: 'home', b: 'MOOM', d: '不動産' }, { ic: 'people', b: 'MatchHub', d: '人材' }, { ic: 'create', b: 'RESONATION', d: '制作' }, { ic: 'dx', b: 'PRAGMATION', d: 'DX支援' }].map((x) => (
                <div key={x.b} className="plp-card plp-brand" data-st><span className="plp-ic"><Ic n={x.ic} /></span><span className="plp-bb">{x.b}</span><span className="plp-bd">{x.d}</span></div>
              ))}
            </div>
          </div>
        </section>

        {/* アプリ */}
        <section className="plp-sec">
          <div className="plp-wrap plp-exp plp-io">
            <h2 className="plp-h2" data-st>すべて、<br/><span className="plp-accent">スマホで完結。</span></h2>
            <ul className="plp-exp-list">
              {[{ ic: 'intro', t: 'アプリからご紹介。' }, { ic: 'phone', t: '進捗を、いつでも確認。' }, { ic: 'reward', t: '報酬の受け取りまで。' }, { ic: 'apply', t: '登録無料・審査のうえご案内。' }].map((t, i) => <li key={i} className="plp-card" data-st><span className="plp-ic"><Ic n={t.ic} /></span><span>{t.t}</span></li>)}
            </ul>
          </div>
        </section>

        {/* 応募 */}
        <section className="plp-sec plp-apply" id="apply">
          <div className="plp-wrap plp-form-wrap plp-io">
            {done ? (
              <div className="plp-card plp-doneblock" data-st>
                <div className="plp-check" aria-hidden><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                <h2 className="plp-h2">応募を受け付けました。</h2><p className="plp-lead">内容を確認のうえ、担当者よりご連絡いたします。</p>
              </div>
            ) : (
              <>
                <div className="plp-form-head" data-st><h2 className="plp-h2">パートナーに応募する</h2><p className="plp-lead">ご入力のうえ送信してください。担当者よりご連絡いたします。</p></div>
                <form className="plp-card plp-form" data-st onSubmit={submit}>
                  <label className="plp-fld"><span>お名前 <i>*</i></span><input value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" required /></label>
                  <div className="plp-fld-row">
                    <label className="plp-fld"><span>会社・屋号（任意）</span><input value={org} onChange={e => setOrg(e.target.value)} placeholder="〇〇会計事務所" /></label>
                    <label className="plp-fld"><span>ご専門（任意）</span><input value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="例：税理士" /></label>
                  </div>
                  <div className="plp-fld-row">
                    <label className="plp-fld"><span>メールアドレス</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" autoComplete="off" /></label>
                    <label className="plp-fld"><span>電話番号</span><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" /></label>
                  </div>
                  <label className="plp-fld"><span>ひとこと（任意）</span><input value={message} onChange={e => setMessage(e.target.value)} placeholder="例：顧問先からの相談が増えています" /></label>
                  <label className="plp-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>株式会社Media Birth からのご連絡に同意します。いただいた情報はご案内のためにのみ使用します。</span></label>
                  {err && <p className="plp-err">{err}</p>}
                  <button className="plp-cta plp-cta-full" type="submit" disabled={busy}>{busy ? '送信中…' : 'パートナーに応募する'}</button>
                </form>
              </>
            )}
          </div>
        </section>

        <footer className="plp-footer">
          <a href="#top" className="plp-hd-logo"><Logo /><b>MB <span>Partners</span></b></a>
          <div className="plp-foot-meta">株式会社Media Birth ・ <a href="/legal/privacy">プライバシーポリシー</a></div>
        </footer>
      </main>
    </div>
  )
}

const CSS = `
.plp{--ink:#17161f;--ink2:#4a4a55;--mut:#8b8894;--line:rgba(23,22,31,.08);--indigo:#5646e6;--indigo2:#7c6cf0;
  color:var(--ink);font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;font-feature-settings:'tnum' 1;position:relative;}
.plp *{box-sizing:border-box;margin:0;}
.tnum,.plp-rv,.plp-step-n{font-variant-numeric:tabular-nums;}
.plp-bg{position:fixed;inset:0;z-index:0;background:radial-gradient(120% 90% at 78% 0%,#f0edfd 0%,#fafafc 46%,#f7f6fb 100%);}
.plp-scene{position:fixed;inset:0;z-index:1;pointer-events:none;}
.plp-main{position:relative;z-index:2;}
.plp-io [data-st],.plp-io[data-st]{opacity:0;transform:translateY(8px);transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1);}
.plp-io.in [data-st],.plp-io.in[data-st]{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.plp-io [data-st]{opacity:1!important;transform:none!important;transition:none!important;}}

.plp-hd{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;padding:16px 32px;transition:background .25s,border-color .25s;border-bottom:0.5px solid transparent;}
.plp-hd.on{background:rgba(255,255,255,.7);backdrop-filter:blur(14px);border-bottom:0.5px solid var(--line);}
.plp-hd-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);}
.plp-hd-logo svg{height:28px;width:28px;display:block;}
.plp-hd-logo b{font-weight:800;font-size:1rem;letter-spacing:-.02em;} .plp-hd-logo b span{color:var(--indigo);}
.plp-hd-cta{height:40px;padding:0 20px;border-radius:12px;background:var(--ink);color:#fff;border:none;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;transition:transform .18s,filter .18s;}
.plp-hd-cta:hover{transform:translateY(-2px);filter:brightness(1.12);} .plp-hd-cta:active{transform:none;}
.plp-hd-cta:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--indigo);}

.plp-hero{min-height:100svh;display:flex;align-items:center;max-width:1120px;margin:0 auto;padding:120px 32px 56px;}
.plp-hero-body{max-width:34em;}
.plp-h1{font-size:60px;font-weight:680;line-height:1.15;letter-spacing:-.02em;color:var(--ink);}
.plp-line{display:block;overflow:hidden;} .plp-line{opacity:0;transform:translateY(102%);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1);}
.plp-io.in .plp-line{opacity:1;transform:none;} .plp-io.in .plp-line:nth-child(2){transition-delay:90ms;}
.plp-quote{color:var(--indigo);}
.plp-h1 em{font-style:normal;background:linear-gradient(100deg,#5646e6,#8a6cf5 60%,#b0a4f8);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-sub{margin-top:26px;font-size:19px;line-height:1.8;color:var(--ink2);font-weight:500;}
.plp-cta-row{margin-top:38px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
.plp-cta{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:56px;padding:0 40px;border-radius:12px;background:var(--ink);color:#fff;border:none;font:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:transform .18s,filter .18s,box-shadow .18s;}
.plp-cta:hover{transform:translateY(-2px);filter:brightness(1.12);box-shadow:0 14px 34px rgba(23,22,31,.22);}
.plp-cta:active{transform:none;filter:brightness(.94);} .plp-cta:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--indigo);}
.plp-cta:disabled{opacity:.5;cursor:default;} .plp-cta-full{width:100%;margin-top:8px;}
.plp-arrow{transition:transform .22s;} .plp-cta:hover .plp-arrow{transform:translateX(5px);}
.plp-cta-note{font-size:.78rem;color:var(--mut);}

.plp-sec{padding:112px 0;}
.plp-wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 32px;}
.plp-h2{font-size:32px;font-weight:700;line-height:1.24;letter-spacing:-.03em;color:var(--ink);margin-bottom:48px;}
.plp-accent{background:linear-gradient(100deg,#5646e6,#8a6cf5);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-lead{margin-top:16px;font-size:15px;line-height:1.8;color:var(--ink2);}
.plp-fine{margin-top:26px;font-size:.74rem;color:var(--mut);line-height:1.75;}

/* frosted glass cards（3Dを透かす） */
.plp-card{background:rgba(255,255,255,.62);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);border:0.5px solid rgba(255,255,255,.8);border-radius:20px;box-shadow:0 1px 0 rgba(255,255,255,.7) inset,0 10px 40px rgba(40,30,80,.06);transition:transform .18s,box-shadow .18s;}
.plp-card:hover{transform:translateY(-4px);box-shadow:0 22px 54px rgba(86,70,230,.14);}
.plp-ic{display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:14px;background:linear-gradient(150deg,rgba(239,237,253,.9),rgba(247,245,255,.9));color:var(--indigo);border:0.5px solid rgba(124,108,240,.24);}

.plp-steps{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.plp-step{padding:32px 28px;}
.plp-step-top{display:flex;align-items:center;justify-content:space-between;}
.plp-step .plp-ic{color:#cfc8ee;transition:color .4s;}
.plp-steps.seq .plp-step:nth-child(1) .plp-ic{transition-delay:.1s;color:var(--indigo);}
.plp-steps.seq .plp-step:nth-child(2) .plp-ic{transition-delay:.5s;color:var(--indigo);}
.plp-steps.seq .plp-step:nth-child(3) .plp-ic{transition-delay:.9s;color:var(--indigo);}
.plp-step-n{font-size:1rem;font-weight:800;letter-spacing:.06em;color:#c9c2e6;}
.plp-ct{margin-top:20px;font-size:1.18rem;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
.plp-cd{margin-top:11px;font-size:15px;line-height:1.75;color:var(--ink2);}
.plp-thread{position:absolute;top:57px;left:16%;width:68%;height:1px;background:var(--indigo2);transform:scaleX(0);transform-origin:left;opacity:.45;transition:transform 1.2s cubic-bezier(.4,0,.2,1) .1s;}
.plp-steps.seq .plp-thread{transform:scaleX(1);}

.plp-rewards{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.plp-reward{padding:34px 30px;}
.plp-reward .plp-ic{margin-bottom:20px;}
.plp-rk{font-size:.82rem;font-weight:700;letter-spacing:.05em;color:var(--mut);}
.plp-rv{margin-top:10px;font-size:1.9rem;font-weight:800;letter-spacing:-.035em;color:var(--ink);display:flex;align-items:baseline;gap:2px;}
.plp-vl{font-size:.9rem;font-weight:700;color:var(--mut);letter-spacing:0;}

.plp-brands{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
.plp-brand{display:flex;flex-direction:column;gap:9px;padding:28px 24px;}
.plp-brand .plp-ic{margin-bottom:6px;transition:transform .18s,color .4s;} .plp-brand:hover .plp-ic{transform:scale(1.03);}
.plp-bb{font-size:1.18rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);} .plp-bd{font-size:.8rem;color:var(--mut);}

.plp-exp{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
.plp-exp .plp-h2{margin-bottom:0;}
.plp-exp-list{list-style:none;display:flex;flex-direction:column;gap:14px;}
.plp-exp-list li{display:flex;gap:16px;align-items:center;font-size:15px;font-weight:500;color:var(--ink);padding:18px 20px;}
.plp-exp-list li:hover{transform:translateX(4px);}
.plp-exp-list li .plp-ic{width:44px;height:44px;flex-shrink:0;}

.plp-apply{padding-bottom:120px;}
.plp-form-wrap{max-width:720px;}
.plp-form-head{text-align:center;margin-bottom:40px;}
.plp-form{display:flex;flex-direction:column;gap:16px;padding:clamp(28px,4vw,44px);}
.plp-form:hover{transform:none;}
.plp-fld-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.plp-fld{display:flex;flex-direction:column;gap:8px;}
.plp-fld>span{font-size:.74rem;font-weight:600;color:var(--ink2);} .plp-fld>span i{color:var(--indigo);font-style:normal;}
.plp-fld input{width:100%;min-height:50px;background:rgba(255,255,255,.7);border:0.5px solid rgba(23,22,31,.14);border-radius:12px;padding:0 15px;color:var(--ink);font:inherit;font-size:.95rem;transition:border-color .18s,box-shadow .18s,background .18s;}
.plp-fld input::placeholder{color:#a6a3b3;}
.plp-fld input:focus{outline:none;border-color:var(--indigo);background:#fff;box-shadow:0 0 0 4px rgba(124,108,240,.15);}
.plp-consent{display:flex;gap:11px;align-items:flex-start;margin-top:6px;cursor:pointer;}
.plp-consent input{margin-top:3px;width:16px;height:16px;accent-color:var(--indigo);flex-shrink:0;}
.plp-consent span{font-size:.76rem;line-height:1.7;color:var(--ink2);}
.plp-err{font-size:.8rem;color:#d64545;}
.plp-doneblock{text-align:center;padding:44px 30px;}
.plp-check{width:60px;height:60px;border-radius:50%;background:var(--indigo);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 12px 34px rgba(86,70,230,.36);}
.plp-doneblock .plp-lead{margin:14px auto 0;}

.plp-footer{border-top:0.5px solid var(--line);padding:38px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;max-width:1120px;margin:0 auto;}
.plp-foot-meta{font-size:.72rem;color:var(--mut);} .plp-foot-meta a{color:var(--indigo);text-decoration:none;position:relative;}
.plp-foot-meta a::after{content:'';position:absolute;left:0;bottom:-2px;width:100%;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .22s;}
.plp-foot-meta a:hover::after{transform:scaleX(1);}

@media (max-width:820px){
  .plp-hd{padding:12px 20px;}
  .plp-steps,.plp-rewards,.plp-brands,.plp-exp,.plp-fld-row{grid-template-columns:1fr;}
  .plp-brands{grid-template-columns:1fr 1fr;}
  .plp-exp{gap:28px;}
  .plp-hero{padding:108px 22px 40px;} .plp-h1{font-size:36px;} .plp-sub{font-size:16px;} .plp-h2{font-size:24px;margin-bottom:32px;}
  .plp-sec{padding:80px 0;} .plp-thread{display:none;} .plp-cta{width:100%;}
}
`
