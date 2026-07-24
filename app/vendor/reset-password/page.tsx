import ResetPasswordForm from '@/components/auth/ResetPasswordForm'
import { exchangeVendorRecoveryCode, updateVendorPassword } from '@/app/password-reset/actions'

export default async function VendorResetPasswordPage(props: {
  searchParams: Promise<{ code?: string; token_hash?: string }>
}) {
  const params = await props.searchParams
  const credential = { code: params.code, tokenHash: params.token_hash }
  return <ResetPasswordForm credential={credential} loginHref="/vendor/login" exchangeCode={exchangeVendorRecoveryCode} updatePassword={updateVendorPassword} />
}
