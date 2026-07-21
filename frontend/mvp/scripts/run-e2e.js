import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 43179, strictPort: true },
})

let exitCode = 1
try {
  await server.listen()
  exitCode = await new Promise((resolve, reject) => {
    const runner = spawn(
      process.execPath,
      ['./node_modules/@playwright/test/cli.js', 'test'],
      { cwd: process.cwd(), stdio: 'inherit' },
    )
    runner.once('error', reject)
    runner.once('exit', code => resolve(code ?? 1))
  })
} finally {
  await server.close()
}

process.exitCode = exitCode
