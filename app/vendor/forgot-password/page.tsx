'use client'

import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'
import { requestVendorPasswordReset } from '@/app/password-reset/actions'

export default function VendorForgotPasswordPage() {
  return <ForgotPasswordForm loginHref="/vendor/login" requestReset={requestVendorPasswordReset} />
}
