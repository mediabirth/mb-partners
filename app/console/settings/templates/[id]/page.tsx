import ConsoleNav from '@/components/ConsoleNav'
import TemplatesScreen from '../TemplatesScreen'
import { loadFreeTemplates, ownerOrRedirect } from '../page'

// Phase3-D②c：直リンクでも左右1画面（一覧＋該当を右に開いた状態）。owner gate。
export const runtime = 'edge'

export default async function TemplateEditDirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await ownerOrRedirect()
  const { templates, signedUrls } = await loadFreeTemplates()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <TemplatesScreen initial={templates} signedUrls={signedUrls} initialSel={id} />
      </div>
    </div>
  )
}
