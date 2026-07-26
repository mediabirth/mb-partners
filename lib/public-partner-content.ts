/** 公開パートナー面の報酬・会社情報正典。LP間の文言二重管理を禁止する。 */
export const PUBLIC_REWARD_TYPES = [
  {
    key: 'fixed',
    title: '固定報酬',
    shortTitle: '固定',
    example: '例：¥30,000を成約時に',
    description: 'メニューごとに定められた金額を、成約時にお支払いします。',
    color: '#5646e6',
  },
  {
    key: 'perf',
    title: '成果連動報酬',
    shortTitle: '成果',
    example: '粗利に応じて',
    description: '成約の粗利など、成果に応じてお支払いします。',
    color: '#15917e',
  },
  {
    key: 'recur',
    title: '継続報酬',
    shortTitle: '継続',
    example: '毎月積み上げ',
    description: '継続的なご契約に対して、毎月つづく報酬をお支払いします。',
    color: '#f2971b',
  },
] as const

export const PUBLIC_REWARD_PAYMENT =
  'お支払いは成約月の翌月末です。'

export const PUBLIC_REWARD_DISCLAIMER =
  '※金額は一例です。実際の報酬はメニュー・成約内容により異なり、収入を保証するものではありません。'

export const PUBLIC_JOIN_REWARD_EXAMPLE =
  '顧問先を一件おつなぎ → 例：¥30,000'

export const PUBLIC_COMPANY_INFO = {
  name: '株式会社Media Birth',
  address: '〒565-0842 大阪府吹田市千里山東2丁目24-21',
  representative: '神原 勝彦',
  established: '2024年3月',
} as const
