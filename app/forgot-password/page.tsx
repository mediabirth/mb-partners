'use client'

import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'
import { requestAppPasswordReset } from '@/app/password-reset/actions'

export default function AppForgotPasswordPage() {
  return <ForgotPasswordForm loginHref="/login" requestReset={requestAppPasswordReset} />
}
