import { getShareCard } from '@/lib/share-card'
import { renderShareCardImage } from '@/lib/share-card-og'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const menuId = new URL(request.url).searchParams.get('m') ?? ''
  const card = await getShareCard(token, menuId)
  return renderShareCardImage(card)
}
