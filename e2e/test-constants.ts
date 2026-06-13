export const E2E = {
  ADMIN_EMAIL:        'e2e-admin@mb-partners.test',
  ADMIN_PASS:         'E2eAdminTest!2024',
  PARTNER_EMAIL:      'e2e-partner@mb-partners.test',
  PARTNER_PASS:       'E2ePartnerTest!2024',
  // M3: second partner (corporate) for tax comparison
  PARTNER2_EMAIL:     'e2e-partner2@mb-partners.test',
  PARTNER2_PASS:      'E2ePartner2Test!2024',
  PARTNER2_CODE:      'E2ETEST2',
  SERVICE_NAME:       'E2Eテストサービス',
  PARTNER_CODE:       'E2ETEST',
  REFERRAL_TOKEN:     'e2etestref123',
  CUSTOMER_REFERRAL:  'E2Eテスト顧客',
  CUSTOMER_PAYOUT:    'E2Eテスト支払確認',
  CUSTOMER_CANCEL:    'E2Eテスト取消対象',
  // M3 specific
  CUSTOMER_CORP:      'E2E法人テスト顧客',    // deal for corporate partner
  REWARD_AMOUNT:      80000,
  WITHHOLDING:        8168,   // Math.round(80000 * 0.1021)
  NET:                71832,  // 80000 - 8168
  FIXED_MONTH:        '2026-06-01',
  BATCH_MONTH:        '2026-06',              // target month for close_month_batch
  // M6: invite flow
  INVITE_EMAIL:       'e2e-invited@mb-partners.test',
  INVITE_NAME:        'E2E招待テスト',
} as const
