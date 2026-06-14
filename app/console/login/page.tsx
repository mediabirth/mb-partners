'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'password' | 'totp' | 'enroll'

export default function ConsoleLoginPage() {
  const router = useRouter()
  const [step, setStep]           = useState<Step>('password')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [code, setCode]           = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [factorId, setFactorId]   = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [qrUri, setQrUri]         = useState('')
  const [enrollId, setEnrollId]   = useState('')

  /* ---- Step 1: パスワード認証 ---- */
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError('メールアドレスまたはパスワードが正しくありません。')
      setLoading(false)
      return
    }

    // MFA レベルを確認
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const currentLevel = aalData?.currentLevel
    const nextLevel    = aalData?.nextLevel

    if (nextLevel === 'aal2') {
      // TOTP 登録済み → 認証コード入力へ
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (totp) {
        const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        if (challengeErr || !challenge) {
          setError('2段階認証の開始に失敗しました。再試行してください。')
          setLoading(false)
          return
        }
        setFactorId(totp.id)
        setChallengeId(challenge.id)
        setStep('totp')
      }
    } else if (currentLevel === 'aal1' && nextLevel === 'aal1') {
      // TOTP 未登録 → 登録フローへ
      const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'MB Partners Console',
      })
      if (enrollErr || !enrollData) {
        setError('2段階認証の設定に失敗しました。')
        setLoading(false)
        return
      }
      setQrUri(enrollData.totp.qr_code)
      setEnrollId(enrollData.id)
      setStep('enroll')
    } else {
      // 既に AAL2 → コンソールへ
      router.push('/console')
    }
    setLoading(false)
  }

  /* ---- Step 2: TOTP 認証 ---- */
  async function handleTotp(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 6) { setError('6桁のコードを入力してください。'); return }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId, challengeId, code,
    })
    setLoading(false)

    if (verifyErr) {
      setError('認証コードが正しくありません。')
      return
    }
    router.push('/console')
  }

  /* ---- Step 3: TOTP 登録（初回） ---- */
  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 6) { setError('6桁のコードを入力してください。'); return }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: enrollId })
    if (!challenge) { setError('認証チャレンジに失敗しました。'); setLoading(false); return }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enrollId,
      challengeId: challenge.id,
      code,
    })
    setLoading(false)

    if (verifyErr) {
      setError('コードが正しくありません。認証アプリで表示されているコードを入力してください。')
      return
    }
    router.push('/console')
  }

  /* ---- UI ---- */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(120% 90% at 85% 0%, var(--blue-bg2) 0%, var(--bg2) 55%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Orbit rings — top-right corner */}
      <div style={{ position: 'absolute', right: -110, top: -110, width: 340, height: 340, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, border: '1.5px solid #EDEBFC', borderRadius: '50%', animation: 'spin 50s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 46, border: '1.5px solid #DCD8FA', borderRadius: '50%', animation: 'spin 34s linear infinite reverse' }} />
        <div style={{ position: 'absolute', inset: 104, border: '1.5px solid #4733E6', borderRadius: '50%', opacity: .22, animation: 'spin 22s linear infinite' }} />
      </div>
      <div style={{
        width: 402, maxWidth: '100%',
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 18,
        padding: '36px 32px 30px',
        boxShadow: '0 28px 80px rgba(14,14,20,.12)',
      }}>
        {/* Logo */}
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
          <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="2.6"/>
          <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="2.6"/>
          <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="2.6"/>
          <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
        </svg>

        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, margin: '14px 0 4px', letterSpacing: '-.012em' }}>
          MB Partners <span style={{ color: 'var(--blue)' }}>Console</span>
        </h2>

        {/* ---- パスワード入力 ---- */}
        {step === 'password' && (
          <>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 20 }}>
              管理者アカウントでログインしてください。すべての操作は監査ログに記録されます。
            </p>
            <form onSubmit={handlePassword}>
              <div className="fld">
                <label>メールアドレス</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@example.com" required autoComplete="email"
                />
              </div>
              <div className="fld">
                <label>パスワード</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••" required autoComplete="current-password"
                />
              </div>
              {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
              <button type="submit" className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? '確認中…' : '次へ（2段階認証）'}
              </button>
            </form>
          </>
        )}

        {/* ---- TOTP 認証 ---- */}
        {step === 'totp' && (
          <>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 20 }}>
              <b>2段階認証</b> — 認証アプリに表示された6桁のコードを入力してください（全管理者で必須）。
            </p>
            <form onSubmit={handleTotp}>
              <div className="fld">
                <label>認証コード</label>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  style={{ letterSpacing: '.4em', fontFamily: 'Inter', fontWeight: 700, textAlign: 'center', fontSize: '1.05rem' }}
                  autoComplete="one-time-code" autoFocus
                />
              </div>
              {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
              <button type="submit" className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? '確認中…' : '認証してログイン'}
              </button>
            </form>
            <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 14, textAlign: 'center' }}>
              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setStep('password'); setCode(''); setError('') }}>
                ← 戻る
              </span>
            </p>
          </>
        )}

        {/* ---- TOTP 登録（初回） ---- */}
        {step === 'enroll' && (
          <>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 16 }}>
              <b>2段階認証の設定</b> — 認証アプリ（Google Authenticator 等）でQRコードを読み取り、表示された6桁のコードを入力してください。
            </p>
            {qrUri && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUri} alt="TOTP QR Code" width={160} height={160} style={{ display: 'inline-block', borderRadius: 8 }} />
              </div>
            )}
            <form onSubmit={handleEnroll}>
              <div className="fld">
                <label>確認コード（6桁）</label>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  style={{ letterSpacing: '.4em', fontFamily: 'Inter', fontWeight: 700, textAlign: 'center', fontSize: '1.05rem' }}
                  autoFocus
                />
              </div>
              {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
              <button type="submit" className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? '登録中…' : '登録して完了'}
              </button>
            </form>
          </>
        )}

        <p style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: 18, textAlign: 'center', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          管理者の追加は招待制（オーナーのみ）。パートナーの方は<br />
          パートナーポータルからログインしてください。
        </p>
      </div>
    </div>
  )
}
