'use client'
/**
 * パートナー募集LP v7 — 文字を捨て、光のネットワークCGで「つながりが価値になる」を表現。
 * 全面: 生きたノード網（node/edge/金の価値パルス）＋スクロール連動＋マウス視差。ページスコープ（three は /partners のみ動的import）。
 * 事実の正典・創作数字禁止。数字の主役は実データ＝6領域（拡大中）と報酬設計（例）。払い出し/人数は実データ連動で将来点灯。
 * 応募は既存 /api/partner-apply(partner_applications)。会社表記「株式会社Media Birth」。
 */
import { useEffect, useRef, useState } from 'react'

// ── 実データ（本番DB services active=on／brand color 実値）。領域は今後も増える＝配列で表現。 ──
const DOMAINS = [
  { n: 'MOOM', k: '不動産', c: '#4733e6' },
  { n: 'MatchHub', k: '人材', c: '#1e9e6a' },
  { n: 'RESONATION', k: '制作', c: '#8b5cf6' },
  { n: 'PRAGMATION', k: '業務改善', c: '#15917e' },
  { n: 'EMANATION', k: 'マーケ', c: '#6d5cf5' },
  { n: 'ENTERSOLOGY', k: 'エンタメ', c: '#ec4899' },
]

// ── 生きた光のネットワーク（動的import・全面固定層・pointer-events:none） ──
function useNetwork(mountRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = mountRef.current; if (!el) return
    let dispose = () => {}; let cancelled = false
    import('three').then((THREE) => {
      if (cancelled) return
      const mobile = matchMedia('(max-width: 820px)').matches
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      const W = () => innerWidth, H = () => innerHeight
      const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2))
      renderer.setSize(W(), H()); renderer.setClearColor(0x000000, 0)
      el.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(58, W() / H(), 0.1, 100); camera.position.z = 15

      // 柔らかい光点テクスチャ（additiveでブルーム風グロー）
      const dot = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d')!
        const g = x.createRadialGradient(48, 48, 0, 48, 48, 48)
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.22, 'rgba(255,255,255,.9)')
        g.addColorStop(.5, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)')
        x.fillStyle = g; x.fillRect(0, 0, 96, 96); return new THREE.CanvasTexture(c)
      })()

      // 配色：インディゴ/バイオレット主体＋ブランド差し色＋価値の金
      const PAL = [0x5646e6, 0x6d5cf5, 0x8b5cf6, 0x7c6cf0, 0x5646e6, 0x1e9e6a, 0x15917e, 0xec4899, 0xf5a524]
      const wcol = () => { const r = Math.random(); return r < .62 ? PAL[(Math.random() * 5) | 0] : PAL[5 + ((Math.random() * 4) | 0)] }

      const group = new THREE.Group(); scene.add(group)
      const N = mobile ? 48 : 104
      const SPREAD_Y = 34, SPREAD_X = mobile ? 8.5 : 15, SPREAD_Z = 5
      const base: Float32Array = new Float32Array(N * 3)
      const pos = new Float32Array(N * 3)
      const col = new Float32Array(N * 3)
      const phase = new Float32Array(N), amp = new Float32Array(N), spd = new Float32Array(N)
      const cc = new THREE.Color()
      for (let i = 0; i < N; i++) {
        const x = (Math.random() - .5) * SPREAD_X, y = (Math.random() - .5) * SPREAD_Y, z = (Math.random() - .5) * SPREAD_Z
        base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
        cc.setHex(wcol()); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b
        phase[i] = Math.random() * 6.28; amp[i] = 0.25 + Math.random() * 0.5; spd[i] = 0.2 + Math.random() * 0.5
      }
      const nGeo = new THREE.BufferGeometry()
      nGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      nGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const nMat = new THREE.PointsMaterial({ size: mobile ? 0.62 : 0.72, map: dot, vertexColors: true, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
      const points = new THREE.Points(nGeo, nMat); group.add(points)

      // エッジ：近傍ノードを接続（距離しきい値）
      const pairs: [number, number][] = []
      const TH = mobile ? 5.6 : 5.2
      for (let i = 0; i < N; i++) {
        let links = 0
        for (let j = i + 1; j < N && links < 3; j++) {
          const dx = base[i * 3] - base[j * 3], dy = base[i * 3 + 1] - base[j * 3 + 1], dz = base[i * 3 + 2] - base[j * 3 + 2]
          if (Math.sqrt(dx * dx + dy * dy + dz * dz) < TH) { pairs.push([i, j]); links++ }
        }
      }
      const E = pairs.length
      const lPos = new Float32Array(E * 2 * 3), lCol = new Float32Array(E * 2 * 3)
      for (let e = 0; e < E; e++) {
        const [a, b] = pairs[e]
        for (let k = 0; k < 3; k++) { lCol[e * 6 + k] = col[a * 3 + k] * 0.9; lCol[e * 6 + 3 + k] = col[b * 3 + k] * 0.9 }
      }
      const lGeo = new THREE.BufferGeometry()
      lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3))
      lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3))
      const lMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: mobile ? 0.16 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
      const lines = new THREE.LineSegments(lGeo, lMat); group.add(lines)

      // 金の価値パルス：エッジ上を流れる粒（つながり→価値）
      const P = mobile ? 8 : 18
      const pPos = new Float32Array(P * 3)
      const pEdge = new Int32Array(P), pT = new Float32Array(P), pSpd = new Float32Array(P)
      for (let i = 0; i < P; i++) { pEdge[i] = (Math.random() * E) | 0; pT[i] = Math.random(); pSpd[i] = 0.15 + Math.random() * 0.25 }
      const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
      const goldTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
        g.addColorStop(0, 'rgba(255,240,205,1)'); g.addColorStop(.4, 'rgba(245,165,36,.85)'); g.addColorStop(1, 'rgba(245,165,36,0)')
        x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c)
      })()
      const pMat = new THREE.PointsMaterial({ size: mobile ? 0.85 : 1.0, map: goldTex, color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
      const pulses = new THREE.Points(pGeo, pMat); group.add(pulses)

      // スクロール連動（フィールドを縦に流す）＋マウス視差
      let scrollF = 0, targetSF = 0
      const onScroll = () => { const max = Math.max(1, document.body.scrollHeight - innerHeight); targetSF = scrollY / max }
      addEventListener('scroll', onScroll, { passive: true }); onScroll()
      const mouse = { x: 0, y: 0 }, mt = { x: 0, y: 0 }
      if (!mobile && !reduce) addEventListener('pointermove', e => { mt.x = (e.clientX / innerWidth - .5); mt.y = (e.clientY / innerHeight - .5) })

      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()) }
      addEventListener('resize', onResize)

      let t = 0, raf = 0, running = true
      const io = new IntersectionObserver(es => { running = es[0].isIntersecting }, { threshold: 0 })
      io.observe(el)
      const clock = new THREE.Clock()
      const frame = () => {
        raf = requestAnimationFrame(frame)
        if (!running) return
        const dt = Math.min(clock.getDelta(), 0.05); t += dt
        scrollF += (targetSF - scrollF) * 0.06
        group.position.y = scrollF * (SPREAD_Y - 8)   // フィールドを流す
        mouse.x += (mt.x - mouse.x) * 0.04; mouse.y += (mt.y - mouse.y) * 0.04
        camera.position.x = mouse.x * 2.2; camera.position.y = -mouse.y * 1.6; camera.lookAt(0, group.position.y * -0.02, 0)
        // ノードの漂い
        if (!reduce) for (let i = 0; i < N; i++) {
          const ph = phase[i]
          pos[i * 3] = base[i * 3] + Math.sin(t * spd[i] + ph) * amp[i]
          pos[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * spd[i] * 0.9 + ph) * amp[i]
          pos[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * spd[i] * 0.6 + ph) * amp[i] * 0.6
        }
        nGeo.attributes.position.needsUpdate = true
        // エッジをノードに追従
        for (let e = 0; e < E; e++) {
          const [a, b] = pairs[e]
          lPos[e * 6] = pos[a * 3]; lPos[e * 6 + 1] = pos[a * 3 + 1]; lPos[e * 6 + 2] = pos[a * 3 + 2]
          lPos[e * 6 + 3] = pos[b * 3]; lPos[e * 6 + 4] = pos[b * 3 + 1]; lPos[e * 6 + 5] = pos[b * 3 + 2]
        }
        lGeo.attributes.position.needsUpdate = true
        lMat.opacity = (mobile ? 0.14 : 0.18) + Math.sin(t * 0.6) * 0.04
        // 金パルスがエッジ上を流れる
        for (let i = 0; i < P; i++) {
          pT[i] += pSpd[i] * dt
          if (pT[i] >= 1) { pT[i] = 0; pEdge[i] = (Math.random() * E) | 0; pSpd[i] = 0.15 + Math.random() * 0.25 }
          const [a, b] = pairs[pEdge[i]] || [0, 0]; const u = pT[i]
          pPos[i * 3] = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * u
          pPos[i * 3 + 1] = pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * u
          pPos[i * 3 + 2] = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * u
        }
        pGeo.attributes.position.needsUpdate = true
        pMat.opacity = 0.7 + Math.sin(t * 2.2) * 0.25
        renderer.render(scene, camera)
      }
      frame()
      dispose = () => {
        cancelled = true; running = false; cancelAnimationFrame(raf)
        io.disconnect(); removeEventListener('scroll', onScroll); removeEventListener('resize', onResize)
        nGeo.dispose(); lGeo.dispose(); pGeo.dispose(); nMat.dispose(); lMat.dispose(); pMat.dispose()
        dot.dispose(); goldTex.dispose(); renderer.dispose()
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      }
    }).catch(() => {})
    return () => dispose()
  }, [mountRef])
}

function useMotion() {
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target as HTMLElement; el.classList.add('in')
        el.querySelectorAll<HTMLElement>('[data-st]').forEach((c, i) => { c.style.transitionDelay = `${i * 80}ms`; c.classList.add('in') })
        io.unobserve(el)
      }
    }), { threshold: 0.18 })
    document.querySelectorAll('.plp-io').forEach(s => io.observe(s))
    return () => io.disconnect()
  }, [])
}

function useCountUp(ref: React.RefObject<HTMLElement | null>, to: number, opts: { prefix?: string; dur?: number } = {}) {
  useEffect(() => {
    const el = ref.current; if (!el) return
    const dur = opts.dur ?? 1600; let started = false
    const run = () => {
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3)
        el.textContent = (opts.prefix ?? '') + Math.round(to * e).toLocaleString('ja-JP')
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !started) { started = true; run(); io.disconnect() } }), { threshold: 0.5 })
    io.observe(el); return () => io.disconnect()
  }, [ref, to, opts.prefix, opts.dur])
}

export default function PartnersLP() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const yenRef = useRef<HTMLSpanElement>(null)
  const sixRef = useRef<HTMLSpanElement>(null)
  const [sticky, setSticky] = useState(false)
  useNetwork(sceneRef)
  useMotion()
  useCountUp(yenRef, 30000, { prefix: '¥' })
  useCountUp(sixRef, DOMAINS.length, { dur: 1100 })

  useEffect(() => {
    const onScroll = () => setSticky(scrollY > 40)
    addEventListener('scroll', onScroll, { passive: true }); onScroll()
    return () => removeEventListener('scroll', onScroll)
  }, [])

  const [name, setName] = useState(''), [org, setOrg] = useState(''), [expertise, setExpertise] = useState('')
  const [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false)
  const [err, setErr] = useState(''), [done, setDone] = useState(false)
  const scrollForm = () => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) return setErr('お名前をご入力ください。')
    if (!email.trim() && !phone.trim()) return setErr('メールまたは電話番号のいずれかをご入力ください。')
    if (!consent) return setErr('ご案内の同意にチェックをお願いします。')
    setBusy(true)
    try {
      const r = await fetch('/api/partner-apply', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, org, expertise, email, phone, message, consent }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '送信に失敗しました。') }
      setDone(true)
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : '送信に失敗しました。') } finally { setBusy(false) }
  }

  return (
    <main className="plp">
      <style>{CSS}</style>
      <div className="plp-field" aria-hidden />
      <div ref={sceneRef} className="plp-scene" aria-hidden />

      <header className={`plp-hd${sticky ? ' on' : ''}`}>
        <a className="plp-hd-logo" href="#top" aria-label="MB Partners">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="3" width="7.5" height="7.5" rx="2.2" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" fill="var(--indigo)" /><circle cx="6.75" cy="17.25" r="3.75" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" fill="var(--indigo)" /></svg>
          <b>MB<span> Partners</span></b>
        </a>
        <button className="plp-hd-cta" onClick={scrollForm}>応募する</button>
      </header>

      <div className="plp-content" id="top">
        {/* ── HERO：光のネットワークが主役。文字は最小限。 ── */}
        <section className="plp-hero plp-io">
          <span className="plp-eyebrow" data-st>MB PARTNERS</span>
          <h1 className="plp-h1" data-st>「つながり」が、<br /><em>価値</em>になる。</h1>
          <div className="plp-cta-row" data-st>
            <button className="plp-cta" onClick={scrollForm}>パートナーに応募する<span className="plp-arrow">→</span></button>
            <span className="plp-cta-note">登録無料・審査あり</span>
          </div>
          <div className="plp-scrollcue" data-st aria-hidden><span /></div>
        </section>

        {/* ── 数字：実データ主役＝6領域（拡大中）＋報酬設計（例） ── */}
        <section className="plp-sec plp-io">
          <div className="plp-wrap plp-stat">
            <div className="plp-stat-hero" data-st>
              <span className="plp-bignum" ref={sixRef}>0</span>
              <div className="plp-stat-cap"><b>領域</b><i>＋ これからも増えていく</i></div>
            </div>
            <div className="plp-reward-row">
              <div className="plp-rcard" data-st style={{ ['--rc' as string]: 'var(--indigo)' }}>
                <span className="plp-rk">固定報酬</span>
                <span className="plp-rv"><i>例：</i><b ref={yenRef}>¥0</b></span>
                <span className="plp-rd">成約でお支払い</span>
              </div>
              <div className="plp-rcard" data-st style={{ ['--rc' as string]: 'var(--teal)' }}>
                <span className="plp-rk">成果連動</span>
                <span className="plp-rv rv-word">粗利に応じて</span>
                <span className="plp-rd">成約の粗利から</span>
              </div>
              <div className="plp-rcard" data-st style={{ ['--rc' as string]: 'var(--gold)' }}>
                <span className="plp-rk">継続報酬</span>
                <span className="plp-rv rv-word">毎月、つづく</span>
                <span className="plp-rd">契約がつづくかぎり</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 領域：実ブランドの光の星座（拡大中） ── */}
        <section className="plp-sec plp-io">
          <div className="plp-wrap">
            <div className="plp-constel" data-st>
              <div className="plp-core"><span>MB</span></div>
              {DOMAINS.map((d, i) => {
                const a = (i / DOMAINS.length) * Math.PI * 2 - Math.PI / 2
                const rx = 40, ry = 40
                const x = 50 + Math.cos(a) * rx, y = 50 + Math.sin(a) * ry
                return (
                  <div key={d.n} className="plp-orb" style={{ left: `${x}%`, top: `${y}%`, ['--oc' as string]: d.c, animationDelay: `${i * 0.4}s` }}>
                    <span className="plp-orb-dot" />
                    <span className="plp-orb-name">{d.n}</span>
                    <span className="plp-orb-kind">{d.k}</span>
                  </div>
                )
              })}
              <div className="plp-orb plp-orb-ghost" style={{ left: '50%', top: '96%' }}><span className="plp-orb-dot" /><span className="plp-orb-name">＋</span></div>
              <svg className="plp-constel-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {DOMAINS.map((d, i) => {
                  const a = (i / DOMAINS.length) * Math.PI * 2 - Math.PI / 2
                  return <line key={i} x1="50" y1="50" x2={50 + Math.cos(a) * 40} y2={50 + Math.sin(a) * 40} stroke={d.c} strokeWidth="0.3" strokeOpacity="0.4" />
                })}
              </svg>
            </div>
          </div>
        </section>

        {/* ── 流れ：3ビート（ほぼ文字なし・光で表現） ── */}
        <section className="plp-sec plp-io">
          <div className="plp-wrap plp-flow" data-st>
            <div className="plp-beat"><span className="plp-beat-glyph b1" /><span className="plp-beat-t">つなぐ</span></div>
            <span className="plp-beat-link" aria-hidden />
            <div className="plp-beat"><span className="plp-beat-glyph b2" /><span className="plp-beat-t">私たちが対応</span></div>
            <span className="plp-beat-link" aria-hidden />
            <div className="plp-beat"><span className="plp-beat-glyph b3" /><span className="plp-beat-t">報酬</span></div>
          </div>
        </section>

        {/* ── 応募：光が収束する一点 ── */}
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
                <div className="plp-form-head" data-st>
                  <h2 className="plp-h2">はじめる。</h2>
                </div>
                <form className="plp-form" data-st onSubmit={submit}>
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
          <footer className="plp-footer">
            <span className="plp-foot-meta">株式会社Media Birth ・ <a href="/legal/privacy">プライバシーポリシー</a></span>
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
.plp-content{position:relative;z-index:2;}

.plp-io [data-st]{opacity:0;transform:translateY(14px);transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1);}
.plp-io.in [data-st]{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.plp-io [data-st]{opacity:1!important;transform:none!important;transition:none!important;}}

.plp-hd{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;padding:16px 32px;transition:background .3s,box-shadow .3s;}
.plp-hd.on{background:rgba(251,250,255,.72);backdrop-filter:blur(16px);box-shadow:0 1px 0 var(--line);}
.plp-hd-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);}
.plp-hd-logo svg{height:28px;width:28px;display:block;}
.plp-hd-logo b{font-weight:800;font-size:1rem;letter-spacing:-.02em;} .plp-hd-logo b span{color:var(--indigo);}
.plp-hd-cta{height:40px;padding:0 20px;border-radius:999px;background:var(--ink);color:#fff;border:none;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;transition:transform .18s,box-shadow .18s;}
.plp-hd-cta:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(26,24,48,.24);} .plp-hd-cta:active{transform:none;}

.plp-hero{min-height:100svh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;max-width:1120px;margin:0 auto;padding:120px 28px 80px;}
.plp-eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.42em;color:var(--indigo);opacity:.8;margin-bottom:26px;padding-left:.42em;}
.plp-h1{font-size:clamp(2.9rem,7vw,5.2rem);font-weight:760;line-height:1.12;letter-spacing:-.045em;color:var(--ink);text-wrap:balance;}
.plp-h1 em{font-style:normal;background:linear-gradient(105deg,#5646e6,#8b5cf6 46%,#f2971b);-webkit-background-clip:text;background-clip:text;color:transparent;}
.plp-cta-row{margin-top:44px;display:flex;align-items:center;gap:22px;flex-wrap:wrap;justify-content:center;}
.plp-cta{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:58px;padding:0 42px;border-radius:999px;background:linear-gradient(100deg,#5646e6,#7c4ff0);color:#fff;border:none;font:inherit;font-size:15px;font-weight:650;cursor:pointer;box-shadow:0 12px 34px rgba(86,70,230,.34);transition:transform .2s,box-shadow .2s,filter .2s;}
.plp-cta:hover{transform:translateY(-3px);box-shadow:0 20px 46px rgba(86,70,230,.44);filter:brightness(1.06);}
.plp-cta:active{transform:none;} .plp-cta:disabled{opacity:.55;cursor:default;} .plp-cta-full{width:100%;height:60px;margin-top:6px;}
.plp-arrow{transition:transform .22s;} .plp-cta:hover .plp-arrow{transform:translateX(5px);}
.plp-cta-note{font-size:.78rem;color:var(--mut);}
.plp-scrollcue{margin-top:64px;width:24px;height:38px;border-radius:14px;border:1.5px solid rgba(86,70,230,.35);position:relative;}
.plp-scrollcue span{position:absolute;top:8px;left:50%;width:4px;height:8px;border-radius:2px;background:var(--indigo);transform:translateX(-50%);animation:cue 1.8s ease-in-out infinite;}
@keyframes cue{0%{opacity:0;transform:translate(-50%,0)}30%{opacity:1}70%{opacity:1}100%{opacity:0;transform:translate(-50%,12px)}}

.plp-sec{padding:clamp(90px,13vh,150px) 0;position:relative;}
.plp-wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 28px;}

/* 数字（実データ主役） */
.plp-stat{display:flex;flex-direction:column;align-items:center;text-align:center;}
.plp-stat-hero{display:flex;align-items:center;gap:26px;flex-wrap:wrap;justify-content:center;}
.plp-bignum{font-size:clamp(6rem,20vw,15rem);font-weight:820;line-height:.86;letter-spacing:-.06em;background:linear-gradient(155deg,#5646e6,#8b5cf6 55%,#f2971b);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums;}
.plp-stat-cap{text-align:left;}
.plp-stat-cap b{display:block;font-size:clamp(1.6rem,4vw,2.4rem);font-weight:800;letter-spacing:-.03em;color:var(--ink);}
.plp-stat-cap i{display:block;margin-top:8px;font-style:normal;font-size:.9rem;font-weight:600;color:var(--indigo);letter-spacing:.02em;}
.plp-reward-row{margin-top:clamp(48px,7vw,84px);display:grid;grid-template-columns:repeat(3,1fr);gap:18px;width:100%;}
.plp-rcard{position:relative;padding:30px 26px;border-radius:22px;background:rgba(255,255,255,.66);backdrop-filter:blur(20px) saturate(1.3);-webkit-backdrop-filter:blur(20px) saturate(1.3);border:0.5px solid rgba(255,255,255,.85);box-shadow:0 12px 40px rgba(40,30,80,.08);text-align:left;overflow:hidden;transition:transform .2s,box-shadow .2s;}
.plp-rcard::before{content:'';position:absolute;inset:0 0 auto 0;height:3px;background:var(--rc);opacity:.9;}
.plp-rcard::after{content:'';position:absolute;top:-40%;right:-20%;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,var(--rc),transparent 68%);opacity:.14;pointer-events:none;}
.plp-rcard:hover{transform:translateY(-5px);box-shadow:0 26px 60px rgba(86,70,230,.16);}
.plp-rk{font-size:.8rem;font-weight:700;letter-spacing:.06em;color:var(--mut);}
.plp-rv{margin-top:14px;display:flex;align-items:baseline;gap:2px;font-size:clamp(1.9rem,4.2vw,2.5rem);font-weight:820;letter-spacing:-.04em;color:var(--ink);font-variant-numeric:tabular-nums;}
.plp-rv i{font-size:.82rem;font-weight:700;font-style:normal;color:var(--mut);letter-spacing:0;}
.plp-rv.rv-word{font-size:clamp(1.5rem,3.4vw,2rem);letter-spacing:-.03em;}
.plp-rd{display:block;margin-top:12px;font-size:.82rem;color:var(--ink2);}

/* 領域：光の星座 */
.plp-constel{position:relative;width:100%;max-width:640px;aspect-ratio:1/1;margin:0 auto;}
.plp-constel::before{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:118%;height:118%;border-radius:50%;background:radial-gradient(circle,rgba(251,250,255,.9) 0%,rgba(248,246,255,.72) 40%,rgba(248,246,255,0) 70%);z-index:0;pointer-events:none;}
.plp-constel-lines{position:absolute;inset:0;width:100%;height:100%;z-index:1;}
.plp-core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:96px;height:96px;border-radius:50%;background:linear-gradient(150deg,#5646e6,#7c4ff0);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1.4rem;letter-spacing:-.02em;box-shadow:0 0 0 10px rgba(86,70,230,.08),0 18px 50px rgba(86,70,230,.4);z-index:2;}
.plp-orb{position:absolute;transform:translate(-50%,-50%);z-index:3;display:flex;flex-direction:column;align-items:center;gap:6px;animation:float 6s ease-in-out infinite;}
@keyframes float{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-50%,calc(-50% - 8px))}}
.plp-orb-dot{width:24px;height:24px;border-radius:50%;background:var(--oc);border:2.5px solid rgba(255,255,255,.92);box-shadow:0 0 0 7px color-mix(in srgb,var(--oc) 18%,transparent),0 0 30px 4px color-mix(in srgb,var(--oc) 62%,transparent),0 6px 16px rgba(0,0,0,.1);}
.plp-orb-name{font-size:.92rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);white-space:nowrap;}
.plp-orb-kind{font-size:.66rem;font-weight:600;color:var(--mut);letter-spacing:.04em;}
.plp-orb-ghost{opacity:.5;} .plp-orb-ghost .plp-orb-dot{background:transparent;border:1.5px dashed var(--mut);box-shadow:none;width:22px;height:22px;} .plp-orb-ghost .plp-orb-name{color:var(--mut);font-size:1rem;}

/* 流れ：3ビート */
.plp-flow{display:flex;align-items:center;justify-content:center;gap:clamp(14px,3vw,44px);flex-wrap:wrap;}
.plp-beat{display:flex;flex-direction:column;align-items:center;gap:16px;}
.plp-beat-glyph{width:clamp(80px,12vw,120px);height:clamp(80px,12vw,120px);border-radius:50%;position:relative;}
.plp-beat-glyph.b1{background:radial-gradient(circle at 40% 35%,#8b5cf6,#5646e6);box-shadow:0 0 0 8px rgba(86,70,230,.08),0 16px 44px rgba(86,70,230,.34);}
.plp-beat-glyph.b2{background:radial-gradient(circle at 40% 35%,#3ec6a0,#15917e);box-shadow:0 0 0 8px rgba(21,145,126,.08),0 16px 44px rgba(21,145,126,.32);}
.plp-beat-glyph.b3{background:radial-gradient(circle at 40% 35%,#ffc24d,#f2971b);box-shadow:0 0 0 8px rgba(242,151,27,.1),0 16px 44px rgba(242,151,27,.34);}
.plp-beat-glyph::after{content:'';position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,255,255,.5);animation:pulse 3s ease-in-out infinite;}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.14);opacity:0}}
.plp-beat-t{font-size:.95rem;font-weight:700;color:var(--ink);letter-spacing:-.01em;}
.plp-beat-link{width:clamp(24px,5vw,72px);height:2px;background:linear-gradient(90deg,rgba(86,70,230,.5),rgba(242,151,27,.5));border-radius:2px;}

/* 応募 */
.plp-apply{padding-bottom:40px;}
.plp-h2{font-size:clamp(1.9rem,4.4vw,2.6rem);font-weight:800;letter-spacing:-.035em;color:var(--ink);text-align:center;}
.plp-form-head{margin-bottom:38px;}
.plp-lead{margin-top:12px;font-size:15px;line-height:1.8;color:var(--ink2);text-align:center;}
.plp-form-wrap{max-width:660px;}
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
.plp-footer{border-top:0.5px solid var(--line);margin-top:70px;padding:34px 28px;text-align:center;max-width:1120px;margin-left:auto;margin-right:auto;}
.plp-foot-meta{font-size:.72rem;color:var(--mut);} .plp-foot-meta a{color:var(--indigo);text-decoration:none;}
.plp-foot-meta a:hover{text-decoration:underline;}

@media (max-width:820px){
  .plp-hd{padding:12px 18px;}
  .plp-hero{padding:110px 22px 60px;}
  .plp-h1{font-size:clamp(1.85rem,8vw,2.45rem);line-height:1.18;letter-spacing:-.04em;}
  .plp-eyebrow{letter-spacing:.34em;margin-bottom:20px;}
  .plp-bignum{font-size:clamp(5.5rem,32vw,8rem);}
  .plp-reward-row{grid-template-columns:1fr;gap:14px;}
  .plp-stat-hero{gap:14px;} .plp-stat-cap{text-align:center;}
  .plp-constel{max-width:340px;}
  .plp-core{width:74px;height:74px;font-size:1.1rem;}
  .plp-orb-name{font-size:.8rem;} .plp-orb-kind{font-size:.6rem;}
  .plp-flow{gap:8px;} .plp-beat-link{width:20px;}
  .plp-fld-row{grid-template-columns:1fr;}
}
`
