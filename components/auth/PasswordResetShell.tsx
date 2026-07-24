'use client'

import Link from 'next/link'
import BrandMark from '@/components/ui/BrandMark'

export default function PasswordResetShell(props: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-field-bg" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <main className="mb-field-bg" style={{
        width: '100%',
        maxWidth: 430,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '40px 28px',
        boxShadow: '0 0 48px rgba(14,14,20,.12)',
      }}>
        <div style={{ marginBottom: 20 }}><BrandMark size={48} /></div>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: '0 0 20px' }}>{props.title}</h1>
        <div className="ui-card" style={{ padding: 18 }}>{props.children}</div>
      </main>
    </div>
  )
}

export function BackToLogin({ href }: { href: string }) {
  return (
    <p style={{ textAlign: 'center', margin: '16px 0 0', fontSize: '.75rem' }}>
      <Link href={href} style={{ color: 'var(--blue)', fontWeight: 600 }}>ログインへ戻る</Link>
    </p>
  )
}
