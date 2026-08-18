import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ShareCardData } from '@/lib/share-card'
import { safePublicDescription } from '@/lib/share-card-public'

const localFont = readFile(join(process.cwd(), 'public/fonts/zen-old-mincho-500-subset.ttf')).then(buffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
)

function safeColor(value: string | null | undefined): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#4733E6'
}

function inlineImage(value: string | null | undefined): string | null {
  // ImageResponseから実行時ネットワークへ出ない。既に埋め込まれた画像だけを許可する。
  return typeof value === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(value) ? value : null
}

function BrandLockup() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#17171F', fontSize: 28, fontWeight: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, border: '2px solid #4733E6', borderRadius: 12, color: '#4733E6', fontSize: 23 }}>M</div>
      <div style={{ display: 'flex' }}>MB Partners</div>
    </div>
  )
}

export async function renderShareCardImage(card: ShareCardData | null): Promise<ImageResponse> {
  const serviceName = card?.service.name ?? 'MB Partners'
  const subject = card?.menu?.name ?? (card ? `${serviceName}のご相談` : '事業のご相談')
  const description = card
    ? safePublicDescription(card.menu?.public_description, card.menu?.name ?? serviceName)
    : 'お仕事や事業について、担当者へご相談いただけます。'
  const color = safeColor(card?.service.color)
  const image = inlineImage(card?.service.image_url)

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#F7F7FA', padding: 52, fontFamily: 'ZenOldMincho' }}>
      <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#FFFFFF', border: '1px solid #E1E1E8', borderRadius: 30, padding: '44px 54px 42px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 18, height: '100%', display: 'flex', background: color }} />
        {/* ImageResponse内の埋め込みdata URL。next/imageはOG rendererでは使用しない。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} width="360" height="180" alt="" style={{ position: 'absolute', right: 0, top: 0, objectFit: 'cover', borderBottomLeftRadius: 28, opacity: 0.92 }} /> : null}
        <BrandLockup />
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: image ? 700 : 980, gap: 20 }}>
          {card ? <div style={{ display: 'flex', color, fontSize: 25, fontWeight: 600 }}>{serviceName}</div> : null}
          <div style={{ display: 'flex', color: '#17171F', fontSize: subject.length > 24 ? 48 : 58, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.02em' }}>{subject}</div>
          <div style={{ display: 'flex', color: '#555560', fontSize: 27, lineHeight: 1.55 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#777782', fontSize: 22 }}>
          <div style={{ display: 'flex' }}>ご相談はこちらから</div>
          <div style={{ display: 'flex', width: 88, height: 4, borderRadius: 2, background: color }} />
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'ZenOldMincho', data: await localFont, weight: 500, style: 'normal' }],
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    },
  )
}
