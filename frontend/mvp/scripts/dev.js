import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(here, '..')
const repoDir = resolve(frontendDir, '..', '..')
const runtimeDir = join(repoDir, 'agent')
const workspaceDir = join(repoDir, 'workspace')
const runtimePort = process.env.CODEGATE_RUNTIME_PORT || '45456'
const venvPython = process.platform === 'win32'
  ? join(runtimeDir, '.venv', 'Scripts', 'python.exe')
  : join(runtimeDir, '.venv', 'bin', 'python')

function runSetup(command, args) {
  const result = spawnSync(command, args, { cwd: runtimeDir, stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`${command} ${args.join(' ')} 실행에 실패했습니다.`)
  }
}

function ensureRuntime() {
  if (!existsSync(venvPython)) {
    console.log('[Vibe Studio] 첫 실행 환경을 준비합니다…')
    runSetup(process.env.PYTHON || 'python3', ['-m', 'venv', '.venv'])
  }
  const probe = spawnSync(
    venvPython,
    ['-c', 'import codegate_agent, claude_agent_sdk'],
    { cwd: runtimeDir, stdio: 'ignore' },
  )
  if (probe.status !== 0) {
    console.log('[Vibe Studio] Claude/Codex 로컬 런타임을 설치합니다…')
    runSetup(venvPython, ['-m', 'pip', 'install', '-e', '.'])
  }
}

async function waitUntilReady(child) {
  const endpoint = `http://127.0.0.1:${runtimePort}/local/ping`
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error('내장 런타임이 시작 중 종료되었습니다.')
    try {
      const response = await fetch(endpoint)
      if (response.ok) return
    } catch { /* 시작 중 */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error('내장 런타임 시작 시간이 초과됐습니다.')
}

ensureRuntime()

const runtimeToken = randomBytes(32).toString('base64url')
const childEnv = {
  ...process.env,
  CODEGATE_RUNTIME_PORT: runtimePort,
  CODEGATE_RUNTIME_TOKEN: runtimeToken,
}
const runtime = spawn(
  venvPython,
  [
    '-m', 'codegate_agent',
    '--port', runtimePort,
    '--workspace', workspaceDir,
    '--projects-dir', repoDir,
  ],
  {
    cwd: runtimeDir,
    env: childEnv,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  },
)

let web
let stopping = false
const stop = signal => {
  if (stopping) return
  stopping = true
  if (web && web.exitCode === null) web.kill(signal)
  if (runtime.exitCode === null) {
    runtime.kill(process.platform === 'win32' ? 'SIGTERM' : 'SIGINT')
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal))
}

try {
  await waitUntilReady(runtime)
  console.log('[Vibe Studio] 프로젝트·Claude Code·Codex 런타임 준비 완료')
  web = spawn(
    process.execPath,
    [join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), ...process.argv.slice(2)],
    {
      cwd: frontendDir,
      env: childEnv,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    },
  )
  const exitCode = await new Promise((resolveExit, reject) => {
    web.once('error', reject)
    web.once('exit', code => resolveExit(code ?? 1))
  })
  stop('SIGTERM')
  process.exitCode = exitCode
} catch (error) {
  console.error(`[Vibe Studio] ${error.message}`)
  stop('SIGTERM')
  process.exitCode = 1
}
