import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [analysisRootArg, projectRootArg] = process.argv.slice(2)
if (!analysisRootArg || !projectRootArg) {
  process.stderr.write('usage: analysis_fallback.mjs <analysis-root> <project-root>\n')
  process.exit(2)
}

const analysisRoot = resolve(analysisRootArg)
const projectRoot = resolve(projectRootArg)
process.env.VIBEGATE_ROOT = projectRoot

try {
  const auditUrl = pathToFileURL(resolve(analysisRoot, 'packages/cli/dist/audit.js')).href
  const engineUrl = pathToFileURL(resolve(analysisRoot, 'packages/engine/dist/index.js')).href
  const loaderUrl = pathToFileURL(resolve(analysisRoot, 'packages/mcp-server/dist/load-ir.js')).href
  const scanUrl = pathToFileURL(resolve(analysisRoot, 'packages/mcp-server/dist/scan.js')).href
  const [{ audit }, { index, inventory }, { loadIrFrom }, { scan }] = await Promise.all([
    import(auditUrl), import(engineUrl), import(loaderUrl), import(scanUrl),
  ])
  const [ir, auditResult, scanResult] = await Promise.all([
    loadIrFrom(projectRoot, 'completion-preflight'),
    audit(projectRoot),
    scan(projectRoot),
  ])
  process.stdout.write(JSON.stringify({
    index: index(ir),
    inventory: inventory(ir),
    audit: auditResult,
    scan: scanResult,
  }))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(3)
}
