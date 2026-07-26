import { PUBLIC_COMPANY_INFO } from '@/lib/public-partner-content'

export default function CompanyTrustBlock({
  className,
}: {
  className?: string
}) {
  return (
    <dl className={className} aria-label="運営会社情報">
      <div><dt>運営会社</dt><dd>{PUBLIC_COMPANY_INFO.name}</dd></div>
      <div><dt>所在地</dt><dd>{PUBLIC_COMPANY_INFO.address}</dd></div>
      <div><dt>代表者</dt><dd>{PUBLIC_COMPANY_INFO.representative}</dd></div>
      <div><dt>設立</dt><dd>{PUBLIC_COMPANY_INFO.established}</dd></div>
    </dl>
  )
}
