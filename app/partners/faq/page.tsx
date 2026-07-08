import type { Metadata } from 'next'
import { SubShell } from '../shell'
import FaqList from './FaqList'

export const metadata: Metadata = {
  title: 'よくある質問 | MB Partners',
  description: 'MB Partners のパートナー募集について、費用・報酬・手間・審査・個人情報など、よくいただくご質問にまとめてお答えします。',
}

export default function FaqPage() {
  return (
    <SubShell kicker="faq" title="よくある質問。" lead="はじめる前の疑問に、まとめてお答えします。">
      <FaqList />
    </SubShell>
  )
}
