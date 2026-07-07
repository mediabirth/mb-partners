'use client'
/**
 * /partners 系ページ共通のモーション基盤。
 * useNetwork: 生きた光のネットワーク（動的import・全面固定層）。useMotion: 入場リビール。useInteractions: 進捗バー＋カーソル光＋CTA磁力。
 * LP(page.tsx)と下層(shell.tsx)の両方で共有し、全ページに同じ世界観を付与する。
 */
import { useEffect } from 'react'

export function useNetwork(mountRef: React.RefObject<HTMLDivElement | null>) {
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

export function useMotion() {
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target as HTMLElement; el.classList.add('in')
        el.querySelectorAll<HTMLElement>('[data-st]').forEach((c, i) => { c.style.transitionDelay = `${i * 90}ms`; c.classList.add('in') })
        if (el.classList.contains('plp-steps')) el.classList.add('seq')
        io.unobserve(el)
      }
    }), { threshold: 0.16 })
    document.querySelectorAll('.plp-io, .sp-io').forEach(s => io.observe(s))
    return () => io.disconnect()
  }, [])
}

export function useInteractions(progRef: React.RefObject<HTMLDivElement | null>, glowRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight
      const p = max > 0 ? Math.min(1, scrollY / max) : 0
      if (progRef.current) progRef.current.style.transform = `scaleX(${p})`
    }
    addEventListener('scroll', onScroll, { passive: true }); onScroll()
    const cleanups: (() => void)[] = [() => removeEventListener('scroll', onScroll)]
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobile = matchMedia('(max-width: 820px)').matches
    if (!reduce && !mobile) {
      let gx = innerWidth / 2, gy = innerHeight / 2, tx = gx, ty = gy, raf = 0
      const move = (e: PointerEvent) => {
        tx = e.clientX; ty = e.clientY
        document.querySelectorAll<HTMLElement>('.plp-cta:not(.plp-cta-full), .sp-cta').forEach(btn => {
          const r = btn.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
          btn.style.transform = Math.hypot(dx, dy) < r.width * 0.85 ? `translate(${dx * 0.2}px,${dy * 0.34}px)` : ''
        })
      }
      const loop = () => { gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12; if (glowRef.current) glowRef.current.style.transform = `translate(${gx}px,${gy}px)`; raf = requestAnimationFrame(loop) }
      addEventListener('pointermove', move); loop()
      cleanups.push(() => { removeEventListener('pointermove', move); cancelAnimationFrame(raf) })
    }
    return () => cleanups.forEach(fn => fn())
  }, [progRef, glowRef])
}
