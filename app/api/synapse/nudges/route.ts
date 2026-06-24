import { NextResponse } from 'next/server'

// ★廃止（retired）：旧・AIナッジ。Phase4 で決定的 lib/synapse-nudge（AI非依存）に置換済みで未使用。
// AI（Anthropic）を一切呼ばない＝トークン消費ゼロ。誤爆/濫用によるコストを防ぐためサーバ側で無効化。
export const runtime = 'nodejs'

const retired = () => NextResponse.json({ disabled: true, retired: true, nudges: [], error: 'この機能は廃止されました。' }, { status: 410 })
export async function GET() { return retired() }
export async function POST() { return retired() }
