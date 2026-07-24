import ResetPasswordForm from '@/components/auth/ResetPasswordForm'
import { exchangeConsoleRecoveryCode, updateConsolePassword } from '@/app/password-reset/actions'

export default async function ConsoleResetPasswordPage(props: {
  searchParams: Promise<{ code?: string; token_hash?: string }>
}) {
  const params = await props.searchParams
  const credential = { code: params.code, tokenHash: params.token_hash }
  return <ResetPasswordForm credential={credential} loginHref="/console/login" exchangeCode={exchangeConsoleRecoveryCode} updatePassword={updateConsolePassword} />
}
