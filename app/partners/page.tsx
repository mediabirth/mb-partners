'use client'
/**
 * パートナー募集LP v4 — 完全設計図に準拠。ページスコープ（three は動的importで /partners のみ・他ページ非バンドル）。
 * ヒーロー: Three.js のガラス質(transmission)浮遊オブジェクト群＋淡いパステル環境。モバイル/reduced-motionは静止画(0負荷)へ自動フォールバック。
 * モーション: 全セクションIO入場(fade+y8→0・600ms・cubic-bezier(.22,1,.36,1)・子70msstagger・一度)／見出し行マスク／¥カウントアップ／3ステップ順次点灯＋細線描画／全interactiveにホバー。
 * 文言は正典(一字一句)。応募は既存 /api/partner-apply(partner_applications)。事実の正典・創作数字禁止。
 */
import { useEffect, useRef, useState } from 'react'

// ── 自作SVGアイコン8種（統一線幅1.5・24グリッド・寄せ集めでない一貫作画） ──
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

// ── Three.js ガラスヒーロー（動的import・desktopのみ live／mobile・reduced-motion は静止画） ──
function useGlassHero(mountRef: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const el = mountRef.current; if (!el) return
    let dispose = () => {}
    let cancelled = false
    import('three').then((THREE) => {
      if (cancelled) return
      const W = () => el.clientWidth, H = () => el.clientHeight
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
      renderer.setSize(W(), H())
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
      el.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 100); camera.position.set(0, 0, 9)

      // 淡いパステル環境（ミント/ピーチ/ラベンダー）→ PMREM で柔らかい映り込み・rim
      const eq = document.createElement('canvas'); eq.width = 512; eq.height = 256
      const g = eq.getContext('2d')!
      const grd = g.createLinearGradient(0, 0, 0, 256)
      grd.addColorStop(0, '#eae6ff'); grd.addColorStop(0.4, '#ffffff'); grd.addColorStop(0.7, '#e6f6ef'); grd.addColorStop(1, '#ffeede')
      g.fillStyle = grd; g.fillRect(0, 0, 512, 256)
      const rg = (x: number, y: number, r: number, c: string) => { const rr = g.createRadialGradient(x, y, 0, x, y, r); rr.addColorStop(0, c); rr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rr; g.fillRect(0, 0, 512, 256) }
      rg(120, 70, 150, 'rgba(150,140,255,.62)'); rg(400, 90, 160, 'rgba(140,220,190,.56)'); rg(300, 210, 160, 'rgba(255,195,150,.56)')
      const envTex = new THREE.CanvasTexture(eq); envTex.mapping = THREE.EquirectangularReflectionMapping
      const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(envTex).texture
      scene.environment = env; envTex.dispose(); pmrem.dispose()

      const glass = (extra?: Partial<THREE.MeshPhysicalMaterialParameters>) => new THREE.MeshPhysicalMaterial({ transmission: 1, ior: 1.2, thickness: 1.1, roughness: 0.22, metalness: 0, color: 0xffffff, envMapIntensity: 1.1, clearcoat: 0.5, clearcoatRoughness: 0.3, transparent: true, ...extra })
      const objs: { m: THREE.Mesh; ph: number; sp: number; amp: number; rot: number }[] = []
      const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, s: number, tint?: number) => {
        const m = new THREE.Mesh(geo, glass(tint ? { attenuationColor: new THREE.Color(tint), attenuationDistance: 2.4 } : {}))
        m.position.set(x, y, z); m.scale.setScalar(s); scene.add(m)
        objs.push({ m, ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 0.5, amp: 0.14 + Math.random() * 0.08, rot: (Math.random() - .5) * 0.006 })
      }
      add(new THREE.SphereGeometry(1, 48, 48), -3.1, 1.0, -0.5, 0.92, 0xbfe9d8)
      add(new THREE.SphereGeometry(1, 64, 64), 2.4, -0.9, -1, 0.8, 0xffd9bf)
      add(new THREE.TorusGeometry(0.9, 0.34, 40, 90), 1.9, 1.3, 0.5, 0.95, 0xccc4ff)
      add(new THREE.BoxGeometry(1.7, 1.7, 0.32), -1.2, -1.2, 0.8, 0.8, 0xd7f0ff)
      add(new THREE.IcosahedronGeometry(0.7, 0), 0.2, 0.2, 1.4, 0.7, 0xffe0cc)

      // 接地のソフトシャドウ（淡い放射状スプライトで擬似・面はガラスのまま）
      const shTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const cx = c.getContext('2d')!; const rr = cx.createRadialGradient(64, 64, 0, 64, 64, 64); rr.addColorStop(0, 'rgba(60,50,90,.22)'); rr.addColorStop(1, 'rgba(60,50,90,0)'); cx.fillStyle = rr; cx.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c) })()
      objs.forEach(o => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: shTex, transparent: true, depthWrite: false })); sp.scale.set(2.4 * o.m.scale.x, 1.0 * o.m.scale.x, 1); sp.position.set(o.m.position.x, o.m.position.y - 1.5 * o.m.scale.x, o.m.position.z - 0.2); scene.add(sp) })

      const mouse = { x: 0, y: 0 }
      const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); mouse.x = ((e.clientX - r.left) / r.width - .5) * 2; mouse.y = ((e.clientY - r.top) / r.height - .5) * 2 }
      el.addEventListener('pointermove', onMove)
      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()) }
      addEventListener('resize', onResize)
      const clock = new THREE.Clock(); let raf = 0, vis = true
      const io = new IntersectionObserver(e => { vis = e[0].isIntersecting; if (vis) loop() }, { threshold: 0 }); io.observe(el)
      const RAD = Math.PI / 180
      const loop = () => {
        if (!vis) return
        const t = clock.getElapsedTime()
        for (const o of objs) { o.m.position.y += Math.sin(t * o.sp + o.ph) * o.amp * 0.016; o.m.rotation.x += o.rot; o.m.rotation.y += o.rot * 0.8 }
        scene.rotation.y += (mouse.x * 3 * RAD - scene.rotation.y) * 0.04
        scene.rotation.x += (mouse.y * 3 * RAD - scene.rotation.x) * 0.04
        renderer.render(scene, camera); raf = requestAnimationFrame(loop)
      }
      loop()
      dispose = () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener('resize', onResize); el.removeEventListener('pointermove', onMove); renderer.dispose(); env.dispose(); el.contains(renderer.domElement) && el.removeChild(renderer.domElement) }
    }).catch(() => {})
    return () => { cancelled = true; dispose() }
  }, [mountRef, active])
}

// 全セクション入場（fade+y8→0・600ms・子70ms stagger・一度）／3ステップ順次点灯
function useMotion() {
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const el = e.target as HTMLElement; el.classList.add('in'); el.querySelectorAll<HTMLElement>('[data-st]').forEach((c, i) => { c.style.transitionDelay = `${i * 70}ms`; c.classList.add('in') }); if (el.classList.contains('plp-steps')) el.classList.add('seq'); io.unobserve(el) } }), { threshold: 0.18 })
    document.querySelectorAll('.plp-io').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}
function useCountUp(ref: React.RefObject<HTMLElement | null>, target: number, prefix = '') {
  useEffect(() => {
    const el = ref.current; if (!el) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { el.textContent = prefix + target.toLocaleString(); return }
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { const st = performance.now(); const dur = 900; const f = (n: number) => { const p = Math.min(1, (n - st) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = prefix + Math.round(target * e).toLocaleString(); if (p < 1) requestAnimationFrame(f) }; requestAnimationFrame(f); io.disconnect() } }, { threshold: 0.6 }); io.observe(el)
    return () => io.disconnect()
  }, [ref, target, prefix])
}
function useSticky() {
  const [on, setOn] = useState(false)
  useEffect(() => { const h = () => setOn(scrollY > 40); addEventListener('scroll', h, { passive: true }); h(); return () => removeEventListener('scroll', h) }, [])
  return on
}

const Logo = () => (
  <svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden>
    <rect x="6" y="6" width="14" height="14" rx="3" stroke="#5646e6" strokeWidth="3.4" />
    <rect x="28" y="6" width="14" height="14" rx="7" stroke="#5646e6" strokeWidth="3.4" />
    <rect x="6" y="28" width="14" height="14" rx="7" stroke="#17161f" strokeWidth="3.4" />
    <rect x="28" y="28" width="14" height="14" rx="3" fill="#5646e6" />
  </svg>
)

export default function PartnersLP() {
  const [interactive, setInteractive] = useState(false) // desktop & !reduced → live three
  const mountRef = useRef<HTMLDivElement | null>(null)
  const yenRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => { setInteractive(!matchMedia('(max-width:820px)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches) }, [])
  useGlassHero(mountRef, interactive)
  useMotion()
  useCountUp(yenRef, 30000, '¥')
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

      {/* sticky header */}
      <header className={`plp-hd${sticky ? ' on' : ''}`}>
        <a href="#top" className="plp-hd-logo"><Logo /><b>MB <span>Partners</span></b></a>
        <button className="plp-hd-cta" onClick={scrollForm}>応募する</button>
      </header>

      {/* ── HERO ── */}
      <section className="plp-hero" id="top">
        {interactive ? <div ref={mountRef} className="plp-canvas" aria-hidden /> : <img className="plp-canvas plp-still" src="/partners-hero.jpg" alt="" aria-hidden />}
        <div className="plp-hero-inner">
          <div className="plp-hero-body plp-io">
            <span className="plp-kicker" data-st>紹介パートナー・プログラム</span>
            <h1 className="plp-h1"><span className="plp-line" data-st><span className="plp-quote">「つながり」</span>という資産を、</span><span className="plp-line" data-st><em>運用する。</em></span></h1>
            <p className="plp-sub" data-st>知人や取引先をご紹介いただくだけ。商談も実務も <b>株式会社Media Birth</b> が担い、成約とともに報酬をお支払いします。</p>
            <div className="plp-cta-row" data-st>
              <button className="plp-cta" onClick={scrollForm}>パートナーに応募する<span className="plp-arrow">→</span></button>
              <span className="plp-cta-note">登録無料・応募制（審査があります）</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── はじめかた ── */}
      <section className="plp-sec">
        <div className="plp-wrap">
          <div className="plp-head plp-io"><span className="plp-kicker2" data-st>はじめかた</span><h2 className="plp-h2" data-st>3つのステップ。あとは、私たちが。</h2></div>
          <div className="plp-steps plp-io">
            {[
              { n: '01', ic: 'intro', t: '紹介する', d: '知人・取引先をアプリからご紹介。リンクを送るだけでも完結します。' },
              { n: '02', ic: 'handle', t: 'Media Birthが対応', d: '商談から実務まで、すべて当社が担います。進捗はアプリでいつでも。' },
              { n: '03', ic: 'reward', t: '成約で報酬', d: '成約が確定すると報酬が発生。お支払いまでアプリで完結します。' },
            ].map((s) => (
              <div key={s.n} className="plp-step" data-st>
                <div className="plp-step-top"><span className="plp-step-ic"><Ic n={s.ic} /></span><span className="plp-step-n">{s.n}</span></div>
                <h3 className="plp-step-t">{s.t}</h3>
                <p className="plp-step-d">{s.d}</p>
              </div>
            ))}
            <span className="plp-thread" aria-hidden />
          </div>
        </div>
      </section>

      {/* ── 報酬のかたち ── */}
      <section className="plp-sec plp-sec-alt">
        <div className="plp-wrap">
          <div className="plp-head plp-io"><span className="plp-kicker2" data-st>報酬のかたち</span><h2 className="plp-h2" data-st>メニューに応じて、3つの報酬。</h2></div>
          <div className="plp-rewards plp-io">
            <div className="plp-reward" data-st><span className="plp-reward-ic"><Ic n="fixed" /></span><div className="plp-reward-k">固定報酬</div><div className="plp-reward-v"><span className="plp-vlbl">例：</span><span ref={yenRef} className="tnum">¥30,000</span></div><div className="plp-reward-d">メニューごとに定めた固定額を、成約時にお支払いします。</div></div>
            <div className="plp-reward" data-st><span className="plp-reward-ic"><Ic n="perf" /></span><div className="plp-reward-k">成果連動</div><div className="plp-reward-v">粗利に応じて</div><div className="plp-reward-d">案件の粗利に連動して報酬が決まるメニューもあります。</div></div>
            <div className="plp-reward" data-st><span className="plp-reward-ic"><Ic n="recur" /></span><div className="plp-reward-k">継続報酬</div><div className="plp-reward-v">毎月つづく</div><div className="plp-reward-d">契約が続くあいだ、継続的に報酬が発生するメニューもあります。</div></div>
          </div>
          <p className="plp-fine plp-io" data-st>※ 金額・条件はメニューにより異なります。上記は一例で、収入を保証するものではありません。</p>
        </div>
      </section>

      {/* ── 領域 ── */}
      <section className="plp-sec">
        <div className="plp-wrap">
          <div className="plp-head plp-io"><span className="plp-kicker2" data-st>ご紹介いただける領域</span><h2 className="plp-h2" data-st>あなたの人脈が活きる、4つの領域。</h2></div>
          <div className="plp-brands plp-io">
            {[
              { ic: 'home', b: 'MOOM', d: '不動産・お住まい' },
              { ic: 'people', b: 'MatchHub', d: '人材・採用' },
              { ic: 'create', b: 'RESONATION', d: '制作・クリエイティブ' },
              { ic: 'dx', b: 'PRAGMATION', d: 'DX・業務支援' },
            ].map((x) => (
              <div key={x.b} className="plp-brand" data-st><span className="plp-brand-ic"><Ic n={x.ic} /></span><span className="plp-brand-b">{x.b}</span><span className="plp-brand-d">{x.d}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── スマホで完結 ── */}
      <section className="plp-sec plp-sec-alt">
        <div className="plp-wrap plp-exp plp-io">
          <div data-st>
            <span className="plp-kicker2">すべて、スマホで完結</span>
            <h2 className="plp-h2">紹介も、進捗の確認も、<br/>報酬の受け取りも。<br/><span className="plp-accent">ひとつのアプリで。</span></h2>
          </div>
          <ul className="plp-exp-list">
            {[
              { ic: 'intro', t: '知人・取引先を、アプリからご紹介。' },
              { ic: 'phone', t: '案件の進捗を、いつでも確認。' },
              { ic: 'reward', t: '報酬の発生から受け取りまで、アプリで完結。' },
              { ic: 'apply', t: '登録は無料。応募制で、審査のうえご案内します。' },
            ].map((t, i) => <li key={i} data-st><span className="plp-exp-ic"><Ic n={t.ic} /></span><span>{t.t}</span></li>)}
          </ul>
        </div>
      </section>

      {/* ── 応募 ── */}
      <section className="plp-sec plp-apply" id="apply">
        <div className="plp-wrap plp-form-wrap plp-io">
          {done ? (
            <div className="plp-doneblock" data-st>
              <div className="plp-check" aria-hidden><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <h2 className="plp-h2">応募を受け付けました。</h2>
              <p className="plp-lead">内容を確認のうえ、担当者よりご連絡いたします。ありがとうございます。</p>
            </div>
          ) : (
            <>
              <div className="plp-form-head" data-st><span className="plp-kicker2">まず、話を聞いてみる</span><h2 className="plp-h2">パートナーに応募する</h2><p className="plp-lead">ご入力のうえ送信してください。担当者よりご連絡いたします。</p></div>
              <form className="plp-form" data-st onSubmit={submit}>
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
    </div>
  )
}

const CSS = `
.plp{--ink:#17161f;--ink2:#4a4a55;--mut:#8b8894;--line:#e8e6f0;--bg:#fbfbfd;--card:#fff;--indigo:#5646e6;--indigo2:#7c6cf0;
  background:var(--bg);color:var(--ink);font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;font-feature-settings:'tnum' 1;}
.plp *{box-sizing:border-box;margin:0;}
.tnum,.plp-reward-v,.plp-step-n{font-variant-numeric:tabular-nums;}
/* 入場: fade + y8→0 / 600ms / cubic-bezier(.22,1,.36,1) / 一度 */
.plp-io [data-st],.plp-io[data-st]{opacity:0;transform:translateY(8px);transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1);}
.plp-io.in [data-st],.plp-io.in[data-st]{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.plp-io [data-st]{opacity:1!important;transform:none!important;transition:none!important;}}

/* sticky header (logo 28px・scroll>40で白85%+blur+下罫線0.5px) */
.plp-hd{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;padding:16px 32px;transition:background .25s,box-shadow .25s,border-color .25s;border-bottom:0.5px solid transparent;}
.plp-hd.on{background:rgba(255,255,255,.85);backdrop-filter:blur(12px);border-bottom:0.5px solid var(--line);}
.plp-hd-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);}
.plp-hd-logo svg{height:28px;width:28px;display:block;}
.plp-hd-logo b{font-weight:800;font-size:1rem;letter-spacing:-.02em;}
.plp-hd-logo b span{color:var(--indigo);}
.plp-hd-cta{height:40px;padding:0 20px;border-radius:12px;background:var(--ink);color:#fff;border:none;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;transition:transform .18s,filter .18s;}
.plp-hd-cta:hover{transform:translateY(-2px);filter:brightness(1.12);}
.plp-hd-cta:active{transform:none;}
.plp-hd-cta:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--indigo);}

.plp-hero{position:relative;min-height:100svh;display:flex;overflow:hidden;background:radial-gradient(120% 95% at 78% 4%,#f1eefe 0%,#fbfbfd 56%);}
.plp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
img.plp-still{object-fit:cover;}
.plp-hero-inner{position:relative;z-index:2;width:100%;max-width:1120px;margin:0 auto;padding:120px 32px 56px;display:flex;flex-direction:column;justify-content:center;}
.plp-hero-body{max-width:34em;}
.plp-kicker{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.26em;color:var(--indigo);text-transform:uppercase;margin-bottom:26px;}
/* ヒーロー見出し 60/36・640-700・-.02em・1.15・行マスク */
.plp-h1{font-size:60px;font-weight:680;line-height:1.15;letter-spacing:-.02em;color:var(--ink);}
.plp-line{display:block;overflow:hidden;}
.plp-line{opacity:0;transform:translateY(102%);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1);}
.plp-io.in .plp-line{opacity:1;transform:none;}
.plp-io.in .plp-line:nth-child(2){transition-delay:90ms;}
.plp-quote{color:var(--indigo);}
.plp-h1 em{font-style:normal;background:linear-gradient(100deg,#5646e6,#8a6cf5 60%,#b0a4f8);-webkit-background-clip:text;background-clip:text;color:transparent;}
/* 副文 17/15・1.9・34em・#4A4A55 */
.plp-sub{margin-top:28px;font-size:17px;line-height:1.9;color:var(--ink2);max-width:34em;}
.plp-sub b{color:var(--ink);font-weight:700;}
.plp-cta-row{margin-top:40px;display:flex;align-items:center;gap:22px;flex-wrap:wrap;}
/* 主CTA 56px・0 40px・radius12・15/600・charcoal/白 */
.plp-cta{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:56px;padding:0 40px;border-radius:12px;background:var(--ink);color:#fff;border:none;font:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:transform .18s,filter .18s,box-shadow .18s;}
.plp-cta:hover{transform:translateY(-2px);filter:brightness(1.12);box-shadow:0 14px 34px rgba(23,22,31,.22);}
.plp-cta:active{transform:none;filter:brightness(.94);}
.plp-cta:focus-visible{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--indigo);}
.plp-cta:disabled{opacity:.5;cursor:default;}
.plp-cta-full{width:100%;margin-top:8px;}
.plp-arrow{transition:transform .22s;}
.plp-cta:hover .plp-arrow{transform:translateX(5px);}
.plp-cta-note{font-size:.78rem;color:var(--mut);}

/* セクション間 160/96・最大幅1120中央 */
.plp-sec{position:relative;padding:80px 0;}
.plp-sec + .plp-sec, .plp-hero + .plp-sec{padding-top:160px;}
.plp-sec-alt{background:linear-gradient(180deg,#f6f5fc,#fbfbfd);border-top:0.5px solid var(--line);border-bottom:0.5px solid var(--line);}
.plp-wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 32px;}
.plp-head{margin-bottom:52px;}
.plp-kicker2{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.24em;color:var(--indigo);text-transform:uppercase;margin-bottom:16px;}
/* セクション見出し 30/24 */
.plp-h2{font-size:30px;font-weight:700;line-height:1.28;letter-spacing:-.03em;color:var(--ink);}
.plp-accent{background:linear-gradient(100deg,#5646e6,#8a6cf5);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-lead{margin-top:16px;font-size:15px;line-height:1.8;color:var(--ink2);max-width:34em;}
.plp-fine{margin-top:28px;font-size:.74rem;color:var(--mut);line-height:1.75;}

/* カード: 0.5px罫線・ホバー時のみ影 */
.plp-steps{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.plp-step{position:relative;background:var(--card);border:0.5px solid var(--line);border-radius:18px;padding:32px 28px;transition:transform .18s,box-shadow .18s,border-color .18s;}
.plp-step:hover{transform:translateY(-4px);box-shadow:0 18px 44px rgba(86,70,230,.1);border-color:rgba(124,108,240,.4);}
.plp-step-top{display:flex;align-items:center;justify-content:space-between;}
.plp-step-ic{display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:14px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:#cfc8ee;border:0.5px solid #e7e3fb;transition:color .4s,background .4s;}
.plp-steps.seq .plp-step:nth-child(1) .plp-step-ic{transition-delay:.1s;color:var(--indigo);}
.plp-steps.seq .plp-step:nth-child(2) .plp-step-ic{transition-delay:.5s;color:var(--indigo);}
.plp-steps.seq .plp-step:nth-child(3) .plp-step-ic{transition-delay:.9s;color:var(--indigo);}
.plp-step-n{font-size:1rem;font-weight:800;letter-spacing:.06em;color:#d6d0ea;}
.plp-step-t{margin-top:20px;font-size:1.18rem;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
.plp-step-d{margin-top:12px;font-size:15px;line-height:1.8;color:var(--ink2);}
/* 3ステップを結ぶ細線 左→右 描画 */
.plp-thread{position:absolute;top:57px;left:16%;width:68%;height:1px;background:linear-gradient(90deg,var(--indigo2),var(--indigo2));transform:scaleX(0);transform-origin:left;opacity:.5;transition:transform 1.2s cubic-bezier(.4,0,.2,1) .1s;}
.plp-steps.seq .plp-thread{transform:scaleX(1);}

.plp-rewards{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
.plp-reward{position:relative;background:var(--card);border:0.5px solid var(--line);border-radius:18px;padding:34px 30px;overflow:hidden;transition:transform .18s,box-shadow .18s,border-color .18s;}
.plp-reward:hover{transform:translateY(-4px);box-shadow:0 18px 44px rgba(86,70,230,.1);border-color:rgba(124,108,240,.4);}
.plp-reward::before{content:'';position:absolute;top:-34%;right:-26%;width:170px;height:170px;background:radial-gradient(circle,rgba(124,108,240,.12),transparent 70%);}
.plp-reward-ic{position:relative;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:13px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:var(--indigo);border:0.5px solid #e7e3fb;margin-bottom:20px;}
.plp-reward-k{font-size:.82rem;font-weight:700;letter-spacing:.05em;color:var(--mut);position:relative;}
.plp-reward-v{margin-top:10px;font-size:1.9rem;font-weight:800;letter-spacing:-.035em;color:var(--ink);position:relative;display:flex;align-items:baseline;gap:2px;}
.plp-vlbl{font-size:.92rem;font-weight:700;color:var(--mut);letter-spacing:0;}
.plp-reward-d{margin-top:14px;font-size:15px;line-height:1.8;color:var(--ink2);position:relative;}

.plp-brands{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
.plp-brand{display:flex;flex-direction:column;gap:9px;padding:28px 24px;border:0.5px solid var(--line);border-radius:18px;background:var(--card);transition:transform .18s,box-shadow .18s,border-color .18s;}
.plp-brand:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(86,70,230,.1);border-color:rgba(124,108,240,.4);}
.plp-brand-ic{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:13px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:var(--indigo);border:0.5px solid #e7e3fb;margin-bottom:6px;transition:transform .18s;}
.plp-brand:hover .plp-brand-ic{transform:scale(1.03);}
.plp-brand-b{font-size:1.18rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);}
.plp-brand-d{font-size:.77rem;color:var(--mut);}

.plp-exp{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
.plp-exp-list{list-style:none;display:flex;flex-direction:column;gap:14px;}
.plp-exp-list li{display:flex;gap:16px;align-items:center;font-size:15px;line-height:1.6;color:var(--ink);background:var(--card);border:0.5px solid var(--line);border-radius:15px;padding:18px 20px;transition:transform .18s,box-shadow .18s;}
.plp-exp-list li:hover{transform:translateX(4px);box-shadow:0 12px 30px rgba(86,70,230,.09);}
.plp-exp-ic{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(150deg,#efedfd,#f7f5ff);color:var(--indigo);border:0.5px solid #e7e3fb;}

.plp-apply{background:radial-gradient(120% 82% at 50% 0%,#efecfc,transparent 58%);}
.plp-form-wrap{max-width:720px;}
.plp-form-head{text-align:center;margin-bottom:44px;}
.plp-form-head .plp-lead{margin-left:auto;margin-right:auto;}
.plp-form{display:flex;flex-direction:column;gap:16px;background:var(--card);border:0.5px solid var(--line);border-radius:22px;padding:clamp(28px,4vw,44px);box-shadow:0 24px 64px rgba(30,25,60,.07);}
.plp-fld-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.plp-fld{display:flex;flex-direction:column;gap:8px;}
.plp-fld>span{font-size:.74rem;font-weight:600;color:var(--ink2);}
.plp-fld>span i{color:var(--indigo);font-style:normal;}
.plp-fld input{width:100%;min-height:50px;background:#fcfcfe;border:0.5px solid #e0dcec;border-radius:12px;padding:0 15px;color:var(--ink);font:inherit;font-size:.95rem;transition:border-color .18s,box-shadow .18s,background .18s;}
.plp-fld input::placeholder{color:#b3b0bf;}
.plp-fld input:focus{outline:none;border-color:var(--indigo);background:#fff;box-shadow:0 0 0 4px rgba(124,108,240,.15);}
.plp-consent{display:flex;gap:11px;align-items:flex-start;margin-top:6px;cursor:pointer;}
.plp-consent input{margin-top:3px;width:16px;height:16px;accent-color:var(--indigo);flex-shrink:0;}
.plp-consent span{font-size:.76rem;line-height:1.7;color:var(--ink2);}
.plp-err{font-size:.8rem;color:#d64545;}
.plp-doneblock{text-align:center;padding:30px 0;}
.plp-check{width:60px;height:60px;border-radius:50%;background:var(--indigo);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 12px 34px rgba(86,70,230,.36);}
.plp-doneblock .plp-lead{margin:14px auto 0;}

.plp-footer{border-top:0.5px solid var(--line);padding:38px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;max-width:1120px;margin:0 auto;}
.plp-foot-meta{font-size:.72rem;color:var(--mut);}
.plp-foot-meta a{color:var(--indigo);text-decoration:none;position:relative;}
.plp-foot-meta a::after{content:'';position:absolute;left:0;bottom:-2px;width:100%;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .22s;}
.plp-foot-meta a:hover::after{transform:scaleX(1);}

@media (max-width:820px){
  .plp-hd{padding:12px 20px;}
  .plp-steps,.plp-rewards,.plp-brands,.plp-exp,.plp-fld-row{grid-template-columns:1fr;}
  .plp-brands{grid-template-columns:1fr 1fr;}
  .plp-exp{gap:30px;}
  .plp-thread{display:none;}
  .plp-hero-inner{padding:108px 22px 40px;}
  .plp-h1{font-size:36px;}
  .plp-sub{font-size:15px;}
  .plp-h2{font-size:24px;}
  .plp-sec + .plp-sec, .plp-hero + .plp-sec{padding-top:96px;}
  .plp-cta{width:100%;}
  .plp-cta-row{gap:14px;}
  .plp-head{margin-bottom:36px;}
}
`
