import type { Metadata } from 'next'

// /partners 系のSEO/OGP既定。下層(guide/rewards/faq)はそれぞれの metadata で title/description を上書き。
export const metadata: Metadata = {
  title: 'パートナー募集 | MB Partners',
  description:
    '「つながり」が、資産になる。ご紹介いただくだけで、商談も実務も当社が対応。固定・成果連動・継続の3タイプの報酬。登録無料・審査あり。株式会社Media Birth 運営。',
  openGraph: {
    title: 'パートナー募集 | MB Partners',
    description: '「つながり」が、資産になる。ご紹介いただくだけ。あとは、私たちが。',
    type: 'website',
    locale: 'ja_JP',
    siteName: 'MB Partners',
    url: 'https://mb-partners.app/partners',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'パートナー募集 | MB Partners',
    description: '「つながり」が、資産になる。ご紹介いただくだけ。あとは、私たちが。',
  },
  alternates: { canonical: 'https://mb-partners.app/partners' },
}

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return children
}
