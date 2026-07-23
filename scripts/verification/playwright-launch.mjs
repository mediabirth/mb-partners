import { chromium } from 'playwright'

/**
 * 通常はPlaywright既定のmulti-process Chromiumを使う。
 * Codex macOS sandboxがMachPortRendezvousServerの登録を拒否した場合だけ、
 * rendererを同一プロセスに閉じ込めて再試行する。
 */
export async function launchChromium(options = {}) {
  try {
    return await chromium.launch(options)
  } catch (error) {
    const message = String(error?.message || error)
    if (!message.includes('MachPortRendezvousServer') || !message.includes('Permission denied')) throw error
    console.warn('Chromium multi-process unavailable; retrying with Codex sandbox fallback')
    return chromium.launch({
      ...options,
      args: [...(options.args || []), '--single-process', '--no-zygote'],
    })
  }
}
