import ResetPasswordForm from '@/components/auth/ResetPasswordForm'
import { exchangeAppRecoveryCode, updateAppPassword } from '@/app/password-reset/actions'

export default async function AppResetPasswordPage(props: {
  searchParams: Promise<{ code?: string; token_hash?: string }>
}) {
  const params = await props.searchParams
  const credential = { code: params.code, tokenHash: params.token_hash }
  return <ResetPasswordForm credential={credential} loginHref="/login" exchangeCode={exchangeAppRecoveryCode} updatePassword={updateAppPassword} />
}
