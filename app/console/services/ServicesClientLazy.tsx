'use client'
import dynamic from 'next/dynamic'
import type { ServiceWithMenus } from '@/lib/supabase/queries'

// A: サービス編集UI（重いクライアント・~500KB）を遅延読込で初回バンドルから除外。
// 表示の読み込み方のみ変更（props/データ/ロジック不変）。読込中は骨組みskeleton。
function ListSkeleton() {
  return (
    <div style={{ padding: '28px', maxWidth: 860 }}>
      <div className="ui-skeleton" style={{ height: 34, width: 200, borderRadius: 8, marginBottom: 20 }} />
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="ui-skeleton" style={{ height: 92, borderRadius: 16, marginBottom: 14 }} />
      ))}
    </div>
  )
}

const ServicesClient = dynamic(() => import('./ServicesClient'), { ssr: false, loading: () => <ListSkeleton /> })

export default function ServicesClientLazy({ initialServices }: { initialServices: ServiceWithMenus[] }) {
  return <ServicesClient initialServices={initialServices} />
}
