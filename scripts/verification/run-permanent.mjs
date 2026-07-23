#!/usr/bin/env node
import { mkdirSync, openSync } from 'node:fs'
import { spawn } from 'node:child_process'

const ROOT = new URL('../../', import.meta.url)
const BASE = 'http://localhost:4599'
const LOG_DIR = '/private/tmp/mb-partners-verify'
mkdirSync(LOG_DIR, { recursive: true })

function run(label, command, args, env = {}) {
  console.log(`\n=== ${label} ===`)
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, CC_MAIL_SUPPRESS: '1', ...env },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${label}: exit ${code}`)))
  })
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${BASE}/login`)
      if (response.status < 500) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('local server did not become ready')
}

await run('build', 'pnpm', ['build'])
const serverLog = openSync(`${LOG_DIR}/server.log`, 'w')
const server = spawn('pnpm', ['start', '-p', '4599'], {
  cwd: ROOT,
  env: { ...process.env, CC_MAIL_SUPPRESS: '1', PORT: '4599' },
  stdio: ['ignore', serverLog, serverLog],
})

let failed = false
try {
  await waitForServer()
  const commonEnv = { BASE_APP: BASE, BASE_CONSOLE: BASE }
  for (const [label, command, args] of [
    ['canon', 'pnpm', ['test:canon']],
    ['integrity', 'node', ['scripts/verification/permanent/verify-integrity.mjs']],
    ['session', 'node', ['scripts/verification/permanent/session-isolation.e2e.mjs']],
    ['performance', 'pnpm', ['exec', 'tsx', 'scripts/verification/permanent/perf-sakusaku.mts']],
    ['resume reload', 'pnpm', ['exec', 'tsx', 'scripts/verification/permanent/resume-reload.e2e.mts']],
    ['resume performance', 'pnpm', ['exec', 'tsx', 'scripts/verification/permanent/resume-perf.mts', 'permanent']],
  ]) {
    try { await run(label, command, args, commonEnv) }
    catch (error) {
      failed = true
      console.error(error instanceof Error ? error.message : error)
    }
  }
} catch (error) {
  failed = true
  console.error(error instanceof Error ? error.message : error)
} finally {
  server.kill('SIGTERM')
}

console.log(failed ? '\nPERMANENT VERIFY: RED' : '\nPERMANENT VERIFY: GREEN')
process.exit(failed ? 1 : 0)
