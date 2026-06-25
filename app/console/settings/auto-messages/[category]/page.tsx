import { notFound } from 'next/navigation'
import ConsoleNav from '@/components/ConsoleNav'
import AutoMessagesScreen from '../AutoMessagesScreen'
import { loadSections, ownerOrRedirect } from '../page'
import { SECTIONS } from '../../messaging-sections'

// Phase3-D②c：直リンクでも左右1画面（7イベント list ＋ 該当を右に開いた状態）。owner gate。
export const runtime = 'edge'

export default async function AutoMessageEditDirectPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  if (!SECTIONS.some(s => s.key === category)) notFound()
  await ownerOrRedirect()
  const { byCategory, signedUrls } = await loadSections()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <AutoMessagesScreen byCategory={byCategory} signedUrls={signedUrls} initialSel={category} />
      </div>
    </div>
  )
}
