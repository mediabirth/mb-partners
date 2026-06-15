'use client'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  async function logout() {
    const sb = createClient()
    await sb.auth.signOut()
    router.push('/login')
  }

  return (
    <div>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>設定</h2>
        </div>
      </div>

      {/* Links group */}
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <SRow as={Link} href="/app/mypage">マイページ</SRow>
        <SRow as={Link} href="/app/guide">サービスガイド</SRow>
        <SRow as={Link} href="/app/terms">パートナー規約・ヘルプ</SRow>
        <SRow as={Link} href="/app/support">お問い合わせ</SRow>
      </div>

      {/*
        ⑩ 通知チャネル — 実態に合わせた表示。
        正本: アプリ内通知（受信箱）＋ メール通知（Resend）。両方とも常時有効。
        プッシュ通知（Web Push）は別タスク（今後対応予定）として「準備中」表示のみ。
        LINE通知は見送りのため UI から除外。
        ※ 永続化バックエンドが無いため操作トグルは置かず、状態表示に統一。
      */}
      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>通知</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <NotiRow title="アプリ内通知" desc="受信箱でいつでも確認できます" state="on" />
        <NotiRow title="メール通知" desc="重要なお知らせをメールでお届けします" state="on" />
        <NotiRow title="プッシュ通知" desc="今後のアップデートで対応予定です" state="soon" last />
      </div>

      <div style={{ margin: '4px 20px' }}>
        <button onClick={logout} className="btn btn-g" style={{ width: '100%', marginTop: 0 }}>
          ログアウト
        </button>
      </div>

      <div style={{ height: 32 }} />
    </div>
  )
}

function SRow({ children, href, as: Comp = 'div' }: { children: React.ReactNode; href?: string; as?: any }) {
  return (
    <Comp href={href} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '15px', borderBottom: '1px solid #F2F2F6',
      fontSize: '.77rem', textDecoration: 'none', color: 'var(--txt)',
      cursor: 'pointer',
    }}>
      <div>{children}</div>
      <span style={{ color: 'var(--muted)' }}>→</span>
    </Comp>
  )
}

function NotiRow({ title, desc, state, last }: { title: string; desc: string; state: 'on' | 'soon'; last?: boolean }) {
  const isOn = state === 'on'
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '14px 15px', borderBottom: last ? 'none' : '1px solid #F2F2F6',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '.77rem', color: 'var(--txt)', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: '.66rem', color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{
        flexShrink: 0, fontSize: '.64rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
        color: isOn ? 'var(--green)' : 'var(--muted2)',
        background: isOn ? 'var(--green-bg)' : 'var(--bg2)',
        border: isOn ? 'none' : '1px solid var(--line)',
      }}>
        {isOn ? '有効' : '準備中'}
      </span>
    </div>
  )
}
