export const E2E = {
  ADMIN_EMAIL:       'e2e-admin@mb-partners.test',
  ADMIN_PASS:        'E2eAdminTest!2024',
  PARTNER_EMAIL:     'e2e-partner@mb-partners.test',
  PARTNER_PASS:      'E2ePartnerTest!2024',
  SERVICE_NAME:      'E2Eテストサービス',
  PARTNER_CODE:      'E2ETEST',
  REFERRAL_TOKEN:    'e2etestref123',
  CUSTOMER_REFERRAL: 'E2Eテスト顧客',
  CUSTOMER_PAYOUT:   'E2Eテスト支払確認',
  CUSTOMER_CANCEL:   'E2Eテスト取消対象',
  REWARD_AMOUNT:     80000,
  WITHHOLDING:       8168,   // Math.round(80000 * 0.1021)
  NET:               71832,  // 80000 - 8168
  FIXED_MONTH:       '2026-06-01',
} as const
