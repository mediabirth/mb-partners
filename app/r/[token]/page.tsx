import type { Metadata } from 'next'
import ReferralLandingClient from './ReferralLandingClient'
import { getShareCard, safePublicDescription, SHARE_CARD_APEX } from '@/lib/share-card'

const GENERIC_TITLE = 'ご相談｜MB Partners'
const GENERIC_DESCRIPTION = 'お仕事や事業について、担当者へご相談いただけます。'

type PageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ m?: string | string[] }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const menuId = typeof query.m === 'string' ? query.m : ''
  const card = await getShareCard(token, menuId)
  const ogUrl = new URL(`/api/og/r/${encodeURIComponent(token)}`, SHARE_CARD_APEX)
  if (menuId) ogUrl.searchParams.set('m', menuId)

  if (!card) {
    return {
      title: GENERIC_TITLE,
      description: GENERIC_DESCRIPTION,
      openGraph: { title: GENERIC_TITLE, description: GENERIC_DESCRIPTION, images: [ogUrl.toString()] },
      twitter: { card: 'summary_large_image', title: GENERIC_TITLE, description: GENERIC_DESCRIPTION, images: [ogUrl.toString()] },
    }
  }

  const title = card.menu ? `${card.menu.name}｜${card.service.name}` : `${card.service.name}のご相談`
  const description = safePublicDescription(card.menu?.public_description, card.menu?.name ?? card.service.name)
  return {
    title,
    description,
    openGraph: { title, description, images: [ogUrl.toString()] },
    twitter: { card: 'summary_large_image', title, description, images: [ogUrl.toString()] },
  }
}

export default function ReferralLandingPage() {
  return <ReferralLandingClient />
}
