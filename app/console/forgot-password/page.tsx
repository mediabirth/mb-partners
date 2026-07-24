'use client'

import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'
import { requestConsolePasswordReset } from '@/app/password-reset/actions'

export default function ConsoleForgotPasswordPage() {
  return <ForgotPasswordForm loginHref="/console/login" requestReset={requestConsolePasswordReset} />
}
