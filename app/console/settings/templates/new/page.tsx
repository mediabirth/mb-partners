import ConsoleNav from '@/components/ConsoleNav'
import TemplatesScreen from '../TemplatesScreen'
import { loadFreeTemplates, ownerOrRedirect } from '../page'

// Phase3-D②c：新規作成も左右1画面（右ペインに空フォーム）。owner gate。
export const runtime = 'edge'

export default async function TemplateNewPage() {
  await ownerOrRedirect()
  const { templates, signedUrls } = await loadFreeTemplates()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <TemplatesScreen initial={templates} signedUrls={signedUrls} initialSel="new" />
      </div>
    </div>
  )
}
