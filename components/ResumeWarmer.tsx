'use client'
/**
 * バックグラウンド復帰ウォーマー（resume-performance・2026-07-18）— 3面共通・chrome単位で1個だけマウント。
 * タブ復帰(visibilitychange/focus)時にUIを一切待たせず裏で:
 *  1) /api/resume-warm を1発（nodejs関数のウォーム＋サーバ側トークンのプロアクティブ更新＝期限切れ後の初回クリックの同期待ちを先回り）
 *  2) 主要リンクを再prefetch（Router Cache失効後の初回遷移でも骨格が即出る）
 *  3) ビルドSHAが自分と異なれば自動リロード（放置中デプロイ→旧チャンク404で「再読み込みが必要」になる事象の根治）
 * スロットル60秒・多重発火なし。計測はscripts/resume-perf.mts。
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ResumeWarmer({ links = [] }: { links?: string[] }) {
  const router = useRouter()
  useEffect(() => {
    let last = 0
    let inflight = false
    let prefetchTimer: ReturnType<typeof setTimeout> | null = null
    const cancelPrefetch = () => {
      if (prefetchTimer === null) return
      clearTimeout(prefetchTimer)
      prefetchTimer = null
    }
    const schedulePrefetch = () => {
      cancelPrefetch()
      // 復帰直後のクリックと同じRSCを同時取得すると遷移が空白化し得る。
      // 操作がなければ裏で再取得し、操作が先なら通常遷移を優先する。
      prefetchTimer = setTimeout(() => {
        prefetchTimer = null
        for (const href of links) { try { router.prefetch(href) } catch { /* best-effort */ } }
      }, 750)
    }
    const warm = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - last < 60_000 || inflight) return
      last = now; inflight = true
      fetch('/api/resume-warm', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const mine = process.env.NEXT_PUBLIC_BUILD_SHA || 'local'
          // 放置中に新デプロイ→旧チャンク参照で操作不能になる前に、復帰の瞬間に一度だけ再読込
          if (d?.sha && mine && d.sha !== mine) window.location.reload()
        })
        .catch(() => {})
        .finally(() => { inflight = false })
      schedulePrefetch()
    }
    const onVis = () => warm()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    document.addEventListener('pointerdown', cancelPrefetch, true)
    return () => {
      cancelPrefetch()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      document.removeEventListener('pointerdown', cancelPrefetch, true)
    }
  }, [router, links])
  return null
}
