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
    const warm = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - last < 60_000 || inflight) return
      last = now; inflight = true
      fetch('/api/resume-warm', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const mine = process.env.NEXT_PUBLIC_BUILD_SHA ?? null
          // 放置中に新デプロイ→旧チャンク参照で操作不能になる前に、復帰の瞬間に一度だけ再読込
          if (d?.sha && mine && d.sha !== mine) window.location.reload()
        })
        .catch(() => {})
        .finally(() => { inflight = false })
      for (const href of links) { try { router.prefetch(href) } catch { /* best-effort */ } }
    }
    const onVis = () => warm()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [router, links])
  return null
}
