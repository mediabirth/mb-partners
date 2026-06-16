'use client'
import { SWRConfig } from 'swr'

// 4: クライアントキャッシュ。遷移はキャッシュで一瞬、focus/再接続で再検証（金額のstale防止）。
// キャッシュはこのプロバイダ配下のメモリのみ（セッション単位）。ログアウト時の full reload で消える。
const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`)
  return r.json()
})

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher,
      revalidateOnFocus: true,      // フォーカス復帰で再検証（金額を最新に）
      revalidateOnReconnect: true,
      keepPreviousData: true,       // 遷移時に前回データを即表示（体感を一瞬に）
      dedupingInterval: 3000,       // 短時間の重複リクエスト抑制
      shouldRetryOnError: false,
    }}>
      {children}
    </SWRConfig>
  )
}
