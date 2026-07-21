import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 43179, strictPort: true },
})

let exitCode = 1
const outputDir = await mkdtemp(join(tmpdir(), 'vibe-studio-e2e-'))
try {
  await server.listen()
  exitCode = await new Promise((resolve, reject) => {
    const runner = spawn(
      process.execPath,
      ['./node_modules/@playwright/test/cli.js', 'test'],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...process.env, PLAYWRIGHT_OUTPUT_DIR: outputDir },
      },
    )
    runner.once('error', reject)
    runner.once('exit', code => resolve(code ?? 1))
  })
} finally {
  await server.close()
  if (exitCode === 0) await rm(outputDir, { recursive: true, force: true })
  else console.error(`E2E artifacts: ${outputDir}`)
}

process.exitCode = exitCode
