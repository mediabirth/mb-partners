'use client'
/**
 * パートナー募集LP v8 — 光のネットワークCGの雰囲気はそのまま、情報構成を復活。
 * 構成: HERO → 数字(実績) → 3ステップ → 報酬(名称のみ) → スマホで完結 → 応募。領域の星座図は廃止(今後増えるため)。
 * 数字: 領域=6は実値。パートナー数/累計お支払いは仮値(勝彦承認 2026-07-07・STATS定数で差替可)。創作数字は景表法配慮でmodest。
 * 応募は既存 /api/partner-apply(partner_applications)。会社表記「株式会社Media Birth」。ページスコープ(three は /partners のみ動的import)。
 */
import { useEffect, useRef, useState } from 'react'

// ── 数字セクション。field=6は実値(services active)。partner/fee は仮値＝実データに差し替え可。 ──
// fee は K表記(千円単位)。to=3200 → "3,200K"（＝¥3,200,000相当）。
const STATS: { key: string; to: number; prefix?: string; suffix?: string; label: string; real?: boolean }[] = [
  { key: 'field', to: 6, prefix: '+', label: 'field', real: true },
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
  { key: 'estate', n: '不動産', c: '#4733e6' },
  { key: 'talent', n: '人材', c: '#1e9e6a' },
  { key: 'create', n: '制作', c: '#8b5cf6' },
  { key: 'ops', n: '業務改善', c: '#15917e' },
  { key: 'marke', n: 'マーケ', c: '#6d5cf5' },
  { key: 'enta', n: 'エンタメ', c: '#ec4899' },
]
const FIELD_GLYPH: Record<string, React.ReactNode> = {
  estate: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 23L24 10l15 13" /><path d="M13 21v15h22V21" /><path d="M20 36v-8h8v8" /></svg>,
  talent: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="5" /><circle cx="31" cy="20" r="4.3" /><path d="M9 37c1-6 5-9 9-9s8 3 9 9" /><path d="M27 35c1-5 4-7.5 7-7.5s6 2.5 7 7.5" /></svg>,
  create: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 35l3-8L32 11l5 5-16 16-8 3z" /><path d="M28 15l5 5" /><path d="M13 35l4-1" /></svg>,
  ops: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="6" /><path d="M24 9v5M24 34v5M39 24h-5M14 24H9M34.6 13.4l-3.5 3.5M16.9 31.1l-3.5 3.5M34.6 34.6l-3.5-3.5M16.9 16.9l-3.5-3.5" /></svg>,
  marke: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21v6l19 8V13z" /><path d="M31 19c4 1.5 4 8.5 0 10" /><path d="M15 27v7h5v-5" /></svg>,
  enta: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="14" /><path d="M20.5 18l9 6-9 6z" fill="currentColor" stroke="none" /></svg>,
}
// MBプロダクト（横スクロール・実ブランド配色）
const PRODUCTS = [
  { n: 'MOOM', c: '#4733e6' }, { n: 'MatchHub', c: '#1e9e6a' }, { n: 'RESONATION', c: '#8b5cf6' },
  { n: 'PRAGMATION', c: '#15917e' }, { n: 'EMANATION', c: '#6d5cf5' }, { n: 'ENTERSOLOGY', c: '#ec4899' },
]

// こんな方へ（パートナー像・動くアイコン）
const AUDIENCE = [
  { key: 'expert', n: '士業・専門家', d: '顧問先の課題を、価値に。', c: '#4733e6' },
  { key: 'exec', n: '経営者・役員', d: '人脈を、新たな収益に。', c: '#1e9e6a' },
  { key: 'sales', n: '営業・フリーランス', d: '日々の出会いを、報酬に。', c: '#8b5cf6' },
  { key: 'company', n: '企業・団体', d: '既存の関係を、資産に。', c: '#ec4899' },
]
const AUDIENCE_GLYPH: Record<string, React.ReactNode> = {
  expert: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="13" y="9" width="22" height="30" rx="3" /><path d="M20 9v-2h8v2" /><circle cx="24" cy="20" r="4" /><path d="M18 31c1-3.5 3.2-5 6-5s5 1.5 6 5" /></svg>,
  exec: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 39V17l11-7 11 7v22" /><path d="M20 39v-8h8v8" /><path d="M19 20h2M27 20h2M19 26h2M27 26h2" /></svg>,
  sales: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="22" cy="16" r="5" /><path d="M12 37c1-6.5 5-9.5 10-9.5s9 3 10 9.5" /><path d="M33 15l5-5M38 10h-4M38 10v4" /></svg>,
  company: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="11" y="19" width="13" height="20" rx="1.5" /><rect x="24" y="12" width="13" height="27" rx="1.5" /><path d="M15 25h4M15 31h4M29 19h4M29 25h4M29 31h4" /></svg>,
}

// FAQ（事実の正典・収入保証や創作数字なし）
const FAQ = [
  { q: 'どんな方に向いていますか？', a: '人とのつながりが多い方に向いています。士業・経営者・営業職など、ご紹介の機会が多い方におすすめです。' },
  { q: '費用はかかりますか？', a: '登録は無料です。審査のうえ、ご案内します。' },
  { q: '何を紹介すればいいですか？', a: '不動産・人材・制作・DXなど、お困りごとをお持ちの方をおつなぎいただくだけです。' },
  { q: '手間はかかりますか？', a: 'ご紹介いただくだけ。商談も実務も、すべて当社が対応します。' },
  { q: '報酬はどう決まりますか？', a: '固定・成果連動・継続の3タイプがあります。内容はメニューにより異なります。' },
]

// ── 生きた光のネットワーク(動的import・全面固定層・pointer-events:none) ──
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

      const dot = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d')!
        const g = x.createRadialGradient(48, 48, 0, 48, 48, 48)
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.22, 'rgba(255,255,255,.9)')
        g.addColorStop(.5, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)')
        x.fillStyle = g; x.fillRect(0, 0, 96, 96); return new THREE.CanvasTexture(c)
      })()

      const PAL = [0x5646e6, 0x6d5cf5, 0x8b5cf6, 0x7c6cf0, 0x5646e6, 0x1e9e6a, 0x15917e, 0xec4899, 0xf5a524]
      const wcol = () => { const r = Math.random(); return r < .62 ? PAL[(Math.random() * 5) | 0] : PAL[5 + ((Math.random() * 4) | 0)] }

      const group = new THREE.Group(); scene.add(group)
      const N = mobile ? 48 : 104
      const SPREAD_Y = 34, SPREAD_X = mobile ? 8.5 : 15, SPREAD_Z = 5
      const base = new Float32Array(N * 3), pos = new Float32Array(N * 3), col = new Float32Array(N * 3)
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

      let scrollF = 0, targetSF = 0
      const onScroll = () => { const max = Math.max(1, document.body.scrollHeight - innerHeight); targetSF = scrollY / max }
      addEventListener('scroll', onScroll, { passive: true }); onScroll()
      const mouse = { x: 0, y: 0 }, mt = { x: 0, y: 0 }
      if (!mobile && !reduce) addEventListener('pointermove', e => { mt.x = (e.clientX / innerWidth - .5); mt.y = (e.clientY / innerHeight - .5) })
      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()) }
      addEventListener('resize', onResize)

      let t = 0, raf = 0, running = true
      const io = new IntersectionObserver(es => { running = es[0].isIntersecting }, { threshold: 0 }); io.observe(el)
      const clock = new THREE.Clock()
      const frame = () => {
        raf = requestAnimationFrame(frame)
        if (!running) return
        const dt = Math.min(clock.getDelta(), 0.05); t += dt
        scrollF += (targetSF - scrollF) * 0.06
        group.position.y = scrollF * (SPREAD_Y - 8)
        mouse.x += (mt.x - mouse.x) * 0.04; mouse.y += (mt.y - mouse.y) * 0.04
        camera.position.x = mouse.x * 2.2; camera.position.y = -mouse.y * 1.6; camera.lookAt(0, group.position.y * -0.02, 0)
        if (!reduce) for (let i = 0; i < N; i++) {
          const ph = phase[i]
          pos[i * 3] = base[i * 3] + Math.sin(t * spd[i] + ph) * amp[i]
          pos[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * spd[i] * 0.9 + ph) * amp[i]
          pos[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * spd[i] * 0.6 + ph) * amp[i] * 0.6
        }
        nGeo.attributes.position.needsUpdate = true
        for (let e = 0; e < E; e++) {
          const [a, b] = pairs[e]
          lPos[e * 6] = pos[a * 3]; lPos[e * 6 + 1] = pos[a * 3 + 1]; lPos[e * 6 + 2] = pos[a * 3 + 2]
          lPos[e * 6 + 3] = pos[b * 3]; lPos[e * 6 + 4] = pos[b * 3 + 1]; lPos[e * 6 + 5] = pos[b * 3 + 2]
        }
        lGeo.attributes.position.needsUpdate = true
        lMat.opacity = (mobile ? 0.14 : 0.18) + Math.sin(t * 0.6) * 0.04
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
        el.querySelectorAll<HTMLElement>('[data-st]').forEach((c, i) => { c.style.transitionDelay = `${i * 90}ms`; c.classList.add('in') })
        if (el.classList.contains('plp-steps')) el.classList.add('seq')
        io.unobserve(el)
      }
    }), { threshold: 0.16 })
    document.querySelectorAll('.plp-io').forEach(s => io.observe(s))
    return () => io.disconnect()
  }, [])
}

function useCountUp(ref: React.RefObject<HTMLElement | null>, to: number, prefix = '', suffix = '', dur = 1700) {
  useEffect(() => {
    const el = ref.current; if (!el) return
    let started = false
    const run = () => {
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3)
        el.textContent = prefix + Math.round(to * e).toLocaleString('ja-JP') + suffix
        if (p < 1) requestAnimationFrame(step)
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
  useNetwork(sceneRef)
  useMotion()

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
      <div className="plp-field" aria-hidden />
      <div ref={sceneRef} className="plp-scene" aria-hidden />

      <header className="plp-hd on">
        <a className="plp-hd-logo" href="#top" aria-label="MB Partners">
          <svg viewBox="0 0 48 48" fill="none" aria-hidden><rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="3" /><rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="3" /><rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="3" /><rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6" /></svg>
          <b>MB<span> Partners</span></b>
        </a>
        <a className="plp-hd-login" href="/app">ログイン</a>
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

        {/* ── field：業種（動くオブジェクト・拡大前提） ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <Kicker label="field" />
            <div className="plp-fields">
              {FIELDS.map(f => (
                <div key={f.key} className="plp-fchip" data-st style={{ ['--fc' as string]: f.c }}>
                  <span className={`plp-fobj fobj-${f.key}`} aria-hidden>{FIELD_GLYPH[f.key]}</span>
                  <span className="plp-fname">{f.n}</span>
                </div>
              ))}
              <div className="plp-fchip plp-fchip-more" data-st>
                <span className="plp-fobj" aria-hidden><b>＋</b><i>など</i></span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 流れ：つなげる・はなす・もたらす(動くオブジェクト) ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <Kicker label="flow" />
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

        {/* ── こんな方へ（パートナー像・動くアイコン） ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <Kicker label="for you" />
            <div className="plp-aud">
              {AUDIENCE.map(a => (
                <div key={a.key} className="plp-audcard" data-st style={{ ['--fc' as string]: a.c }}>
                  <span className={`plp-aud-obj aud-${a.key}`} aria-hidden>{AUDIENCE_GLYPH[a.key]}</span>
                  <span className="plp-aud-n">{a.n}</span>
                  <span className="plp-aud-d">{a.d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── fee type：固定・成果・継続(動くフラットイラスト) ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <Kicker label="fee type" />
            <div className="plp-rewards">
              {REWARDS.map(r => (
                <div key={r.key} className="plp-rw" data-st style={{ ['--rc' as string]: r.c }}>
                  <span className="plp-rw-card" aria-hidden>{REWARD_ILLUS[r.key]}</span>
                  <span className="plp-rw-t">{r.t}</span>
                  <span className="plp-rw-d">{r.d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── MBプロダクト（横スクロール・ずっと動く） ── */}
        <section className="plp-mq-sec plp-io">
          <div className="plp-kicker plp-mq-kicker" data-st><span className="plp-kicker-dot" aria-hidden />our products</div>
          <div className="plp-marquee" aria-hidden>
            <div className="plp-mq-track">
              {[...PRODUCTS, ...PRODUCTS, ...PRODUCTS, ...PRODUCTS].map((p, i) => (
                <span key={i} className="plp-mq-item" style={{ color: p.c }}>{p.n}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── すべて、スマホで完結 ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap">
            <div className="plp-complete">
            <div className="plp-phone" data-st aria-hidden>
              <div className="plp-phone-body">
                <span className="plp-phone-dot d1" /><span className="plp-phone-dot d2" /><span className="plp-phone-dot d3" />
                <span className="plp-phone-line l1" /><span className="plp-phone-line l2" /><span className="plp-phone-line l3" />
                <span className="plp-phone-pulse" />
              </div>
            </div>
            <div className="plp-complete-txt">
              <h2 className="plp-h2" data-st>すべて、スマホで。</h2>
              <p className="plp-lead" data-st>紹介も、進捗も、報酬の確認も。<br />アプリひとつで完結します。</p>
            </div>
            </div>
          </div>
        </section>

        {/* ── FAQ（アコーディオン） ── */}
        <section className="plp-sec plp-calm plp-io">
          <div className="plp-wrap plp-faq-wrap">
            <Kicker label="faq" />
            <Faq />
          </div>
        </section>

        {/* ── 応募 ── */}
        <section id="apply" className="plp-sec plp-apply plp-io">
          <div className="plp-wrap plp-form-wrap">
            <Kicker label="join" />
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
@media (prefers-reduced-motion:reduce){.plp-io [data-st]{opacity:1!important;transform:none!important;transition:none!important;} .plp *{animation:none!important;}}

.plp-hd{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;padding:15px 32px;background:rgba(251,250,255,.66);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);box-shadow:0 1px 0 var(--line);}
.plp-hd-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);}
.plp-hd-logo svg{height:27px;width:27px;display:block;overflow:visible;}
.plp-hd-logo svg rect{transition:transform .45s cubic-bezier(.34,1.56,.64,1);transform-box:fill-box;transform-origin:center;}
.plp-hd-logo svg rect:nth-of-type(2){transition-delay:.04s;} .plp-hd-logo svg rect:nth-of-type(3){transition-delay:.08s;}
.plp-hd-logo svg rect:nth-of-type(4){transition-delay:.12s;animation:logopulse 3.2s ease-in-out infinite;}
.plp-hd-logo:hover svg rect:nth-of-type(1){transform:rotate(-12deg) scale(1.06);}
.plp-hd-logo:hover svg rect:nth-of-type(2){transform:scale(1.16);}
.plp-hd-logo:hover svg rect:nth-of-type(3){transform:scale(1.16);}
.plp-hd-logo:hover svg rect:nth-of-type(4){transform:rotate(45deg) scale(1.1);}
@keyframes logopulse{0%,100%{opacity:1}50%{opacity:.6}}
.plp-hd-logo b{font-weight:800;font-size:1rem;letter-spacing:-.02em;} .plp-hd-logo b span{color:var(--indigo);}
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
.plp-statnum{font-size:clamp(3.4rem,7vw,5.6rem);font-weight:820;line-height:1.04;letter-spacing:-.05em;background:linear-gradient(155deg,#5646e6,#8b5cf6 55%,#f2971b);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums;padding:0 .06em;}
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
.fobj-estate svg{animation:fbob 3s ease-in-out infinite;} .fobj-talent svg{animation:fbeat 2.4s ease-in-out infinite;}
.fobj-create svg{animation:fwiggle 3s ease-in-out infinite;} .fobj-ops svg{animation:fspin 8s linear infinite;}
.fobj-marke svg{animation:fshake 2.6s ease-in-out infinite;} .fobj-enta svg{animation:fbeat 2s ease-in-out infinite;}
@keyframes fbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes fbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.13)}}
@keyframes fwiggle{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
@keyframes fspin{to{transform:rotate(360deg)}}
@keyframes fshake{0%,100%{transform:rotate(-5deg)}25%{transform:rotate(5deg)}50%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
.plp-fname{font-size:.98rem;font-weight:800;letter-spacing:-.01em;color:var(--ink);}
.plp-fchip-more .plp-fobj{flex-direction:column;gap:1px;color:var(--mut);border-style:dashed;background:rgba(255,255,255,.36);box-shadow:none;animation:none;}
.plp-fchip-more .plp-fobj b{font-size:1.7rem;font-weight:300;line-height:1;} .plp-fchip-more .plp-fobj i{font-style:normal;font-size:.66rem;font-weight:600;letter-spacing:.02em;}

/* こんな方へ（パートナー像・動くアイコン） */
.plp-aud{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;max-width:960px;margin:0 auto;}
.plp-audcard{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:30px 18px;border-radius:22px;background:rgba(255,255,255,.62);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);border:0.5px solid rgba(255,255,255,.85);box-shadow:0 12px 40px rgba(40,30,80,.07);transition:transform .2s,box-shadow .2s;}
.plp-audcard:hover{transform:translateY(-6px);box-shadow:0 26px 56px color-mix(in srgb,var(--fc) 18%,rgba(40,30,80,.1));}
.plp-aud-obj{width:66px;height:66px;border-radius:19px;display:flex;align-items:center;justify-content:center;color:var(--fc);background:linear-gradient(150deg,color-mix(in srgb,var(--fc) 14%,#fff),color-mix(in srgb,var(--fc) 5%,#fff));border:1px solid color-mix(in srgb,var(--fc) 16%,transparent);}
.plp-aud-obj svg{width:36px;height:36px;transform-box:fill-box;transform-origin:center;}
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
.plp-mq-item{display:inline-flex;align-items:center;white-space:nowrap;font-size:clamp(1.5rem,3.2vw,2.3rem);font-weight:800;letter-spacing:-.01em;padding-right:clamp(30px,4.5vw,60px);opacity:.92;}
.plp-mq-item::after{content:'';width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.45;margin-left:clamp(30px,4.5vw,60px);}

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
.plp-footer{border-top:0.5px solid var(--line);margin:70px auto 0;padding:34px 28px;text-align:center;max-width:1080px;}
.plp-foot-meta{font-size:.72rem;color:var(--mut);} .plp-foot-meta a{color:var(--indigo);text-decoration:none;}
.plp-foot-meta a:hover{text-decoration:underline;}

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
  .plp-aud{grid-template-columns:1fr 1fr;gap:12px;} .plp-audcard{padding:22px 12px;gap:11px;} .plp-aud-obj{width:56px;height:56px;} .plp-aud-obj svg{width:30px;height:30px;} .plp-aud-n{font-size:.92rem;} .plp-aud-d{font-size:.74rem;}
  .plp-faq-q{font-size:.9rem;padding:16px 18px;} .plp-faq-a p{padding:0 18px 18px;font-size:.84rem;}
}
`
