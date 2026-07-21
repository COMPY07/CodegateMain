// ============================================================================
// ProjectSource — 에디터와 "프로젝트 데이터 출처" 사이의 계약(contract)
// ============================================================================
//
// 이 파일은 프론트엔드 에디터가 의존하는 유일한 인터페이스다.
// 지금은 브라우저 내장 File System Access API 로 실제 로컬 폴더를 읽지만,
// 나중에 백엔드가 준비되면 아래 "계약"만 동일하게 구현해 이 파일 내부를
// HTTP 호출 등으로 교체하면 된다. 에디터(LeftSidebar/CodeViewer 등) 코드는
// 바뀌지 않는다.
//
// ── 계약(백엔드가 맞춰야 할 데이터 모양) ────────────────────────────────────
//
// TreeNode = {
//   name: string,
//   type: 'folder' | 'file',
//   icon?: string,
//   open?: boolean,          // 폴더 초기 펼침 여부
//   children?: TreeNode[],   // type === 'folder' 일 때
// }
//
// Project = {
//   id: string,
//   name: string,            // 루트 폴더 이름
//   kind: 'react' | 'node' | 'java' | 'python' | 'rust' | 'go' | 'unknown',
//   lastOpenedAt: number,    // epoch ms
//   fileTree: TreeNode[],    // mockData.fileTree 와 동일한 모양
//   readFile(path): Promise<{ language, code } | null>,
//                            // path 는 트리에서 '/'로 이은 파일 경로
//                            // (예: 'my-app/src/App.jsx')
// }
//
// RecentProject = { id, name, kind, lastOpenedAt }  // 목록 표시용 메타
//
// ── 지원 함수 ────────────────────────────────────────────────────────────
//   isSupported()          → boolean   현재 브라우저에서 실제 폴더 열기 가능?
//   openDirectory()        → Project   폴더 선택 → 프로젝트로 변환 + 최근목록 저장
//   listRecent()           → RecentProject[]
//   reopenProject(id)      → Project   저장된 handle 로 권한 재요청 후 다시 열기
//   removeRecent(id)       → void
// ============================================================================

// ── 브라우저 지원 여부 ──────────────────────────────────────────────────────
export function isSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

// ── 재귀 탐색에서 건너뛸 디렉터리 / 한도 ───────────────────────────────────
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.cache', '.vite', 'coverage', '.idea', 'target', '.gradle', '__pycache__',
  '.venv', 'venv', '.svn', '.turbo',
])
const MAX_DEPTH = 12
const MAX_FILES = 4000

// ── 확장자 → 아이콘 / language 매핑 ────────────────────────────────────────
const EXT_ICON = {
  jsx: '⚛', tsx: '⚛', js: '⚛', ts: '⚛', mjs: '⚛', cjs: '⚛',
  css: '🎨', scss: '🎨', sass: '🎨', less: '🎨',
  html: '🌐', htm: '🌐',
  json: '📦', md: '📄', markdown: '📄', txt: '📄',
  py: '🐍', java: '☕', rs: '🦀', go: '🐹',
  png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', webp: '🖼', bmp: '🖼', avif: '🖼', ico: '🖼',
  pdf: '📕',
}
const EXT_LANGUAGE = {
  jsx: 'jsx', tsx: 'tsx', js: 'js', ts: 'ts', mjs: 'js', cjs: 'js',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  html: 'html', htm: 'html',
  json: 'json', md: 'markdown', markdown: 'markdown',
  sh: 'bash', bash: 'bash', py: 'python', java: 'java', rs: 'rust', go: 'go',
}
// 이미지 / PDF 는 텍스트 대신 미리보기(blob URL)로 보여준다.
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico'])
const PDF_EXT = new Set(['pdf'])
// 미리보기 자체가 불가능한 그 밖의 바이너리 확장자
const BINARY_EXT = new Set(['zip', 'woff', 'woff2', 'ttf', 'eot', 'mp4', 'mov', 'mp3', 'wav', 'exe', 'dll', 'bin'])

const extOf = (name) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}
const iconFor = (name) => EXT_ICON[extOf(name)] || '📄'
const languageFor = (name) => EXT_LANGUAGE[extOf(name)] || ''

// ── 프로젝트 종류 추정 (루트 파일 이름 기준) ───────────────────────────────
function detectKind(rootNames, pkgText) {
  if (rootNames.has('package.json')) {
    if (pkgText && /"react"\s*:/.test(pkgText)) return 'react'
    return 'node'
  }
  if (rootNames.has('pom.xml') || rootNames.has('build.gradle') || rootNames.has('build.gradle.kts')) return 'java'
  if (rootNames.has('requirements.txt') || rootNames.has('pyproject.toml') || rootNames.has('setup.py')) return 'python'
  if (rootNames.has('cargo.toml')) return 'rust'
  if (rootNames.has('go.mod')) return 'go'
  return 'unknown'
}

// ── 디렉터리 재귀 탐색 → TreeNode[] + path→handle 맵 ───────────────────────
async function walk(dirHandle, basePath, depth, handleMap, counter) {
  const folders = []
  const files = []
  for await (const entry of dirHandle.values()) {
    if (counter.count >= MAX_FILES) break
    if (entry.kind === 'directory') {
      if (IGNORED_DIRS.has(entry.name)) continue   // 무거운 디렉터리는 건너뛴다
      folders.push(entry)
    } else {
      files.push(entry)
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  const nodes = []
  for (const folder of folders) {
    const path = basePath ? `${basePath}/${folder.name}` : folder.name
    const children = depth < MAX_DEPTH
      ? await walk(folder, path, depth + 1, handleMap, counter)
      : []
    nodes.push({ name: folder.name, type: 'folder', open: false, children })
  }
  for (const file of files) {
    if (counter.count >= MAX_FILES) break
    counter.count++
    const path = basePath ? `${basePath}/${file.name}` : file.name
    handleMap.set(path, file)
    nodes.push({ name: file.name, type: 'file', icon: iconFor(file.name) })
  }
  return nodes
}

// ── FileSystemDirectoryHandle → Project 로 변환 ───────────────────────────
async function buildProject(id, dirHandle) {
  const rootName = dirHandle.name || '프로젝트'
  const handleMap = new Map()
  const counter = { count: 0 }

  // 루트 직계 파일 이름을 모아 프로젝트 종류를 추정한다.
  const rootNames = new Set()
  let pkgText = ''
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      rootNames.add(entry.name.toLowerCase())
      if (entry.name === 'package.json') {
        try { pkgText = await (await entry.getFile()).text() } catch { /* 무시 */ }
      }
    }
  }
  const kind = detectKind(rootNames, pkgText)

  const children = await walk(dirHandle, rootName, 1, handleMap, counter)
  const fileTree = [{ name: rootName, type: 'folder', open: true, children }]

  // 파일 종류별 결과:
  //   { type:'text',  language, code }
  //   { type:'image', url, mime }      ← 호출부가 다 쓰면 URL.revokeObjectURL 필요
  //   { type:'pdf',   url }            ← 위와 동일
  //   { type:'binary', name }          ← 미리보기 불가
  const readFile = async (path) => {
    const handle = handleMap.get(path)
    if (!handle) return null
    const name = path.slice(path.lastIndexOf('/') + 1)
    const ext = extOf(name)
    if (BINARY_EXT.has(ext)) return { type: 'binary', name }
    try {
      const file = await handle.getFile()
      if (IMAGE_EXT.has(ext)) return { type: 'image', url: URL.createObjectURL(file), mime: file.type }
      if (PDF_EXT.has(ext)) return { type: 'pdf', url: URL.createObjectURL(file) }
      const code = await file.text()
      return { type: 'text', language: languageFor(name), code }
    } catch {
      return { type: 'text', language: '', code: '파일을 읽지 못했습니다. 권한이 만료되었을 수 있습니다.' }
    }
  }

  return {
    id,
    name: rootName,
    kind,
    lastOpenedAt: Date.now(),
    fileTree,
    readFile,
  }
}

// ── IndexedDB: 최근 프로젝트의 디렉터리 handle 저장 ────────────────────────
// (FileSystemDirectoryHandle 은 구조화 복제 가능해 IndexedDB 에는 저장되지만
//  localStorage 에는 저장할 수 없다. 그래서 별도 저장소를 쓴다.)
const DB_NAME = 'vibe-studio'
const STORE = 'recent-projects'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(record) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

async function idbGetAll() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result || []) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

async function idbGet(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => { db.close(); resolve(req.result || null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

async function idbDelete(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// 안정적인 id: 이름 + 최초 저장 시각. 같은 이름 폴더도 개별 항목으로 남는다.
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`)

// ── 권한 확인/요청 ─────────────────────────────────────────────────────────
async function ensurePermission(handle, mode = 'read') {
  const opts = { mode }
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  return (await handle.requestPermission?.(opts)) === 'granted'
}

// ── 공개 API ───────────────────────────────────────────────────────────────

// 폴더 선택 → 프로젝트로 변환하고 최근 목록에 저장한다.
export async function openDirectory() {
  if (!isSupported()) {
    throw new Error('이 브라우저는 로컬 폴더 열기를 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.')
  }
  let dirHandle
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'read' })
  } catch (err) {
    if (err?.name === 'AbortError') return null // 사용자가 취소
    throw err
  }
  const id = makeId()
  const project = await buildProject(id, dirHandle)
  // handle 을 최근 목록에 저장 (권한은 다음 방문에 재요청)
  await idbPut({ id, name: project.name, kind: project.kind, lastOpenedAt: project.lastOpenedAt, handle: dirHandle })
  return project
}

// 이름을 받아 상위 폴더를 선택하게 하고, 그 안에 새 프로젝트 폴더를 만든다.
// 브라우저는 절대 경로 입력을 허용하지 않으므로 "이름 + 상위 폴더 선택" 방식이다.
export async function createProject(name) {
  if (!isSupported()) {
    throw new Error('이 브라우저는 로컬 폴더 만들기를 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.')
  }
  const clean = (name || '').trim()
  if (!clean) throw new Error('프로젝트 이름을 입력하세요.')
  if (/[\\/:*?"<>|]/.test(clean)) throw new Error('이름에 \\ / : * ? " < > | 문자는 쓸 수 없습니다.')

  // 상위(생성 위치) 폴더 선택 — 사용자 제스처 안에서 첫 await 여야 한다.
  let parent
  try {
    parent = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (err) {
    if (err?.name === 'AbortError') return null // 사용자가 취소
    throw err
  }
  if (!(await ensurePermission(parent, 'readwrite'))) {
    throw new Error('선택한 폴더에 쓰기 권한이 필요합니다.')
  }

  // 같은 이름 폴더가 이미 있으면 중단한다.
  let exists = true
  try { await parent.getDirectoryHandle(clean, { create: false }) } catch { exists = false }
  if (exists) throw new Error(`선택한 위치에 '${clean}' 폴더가 이미 있습니다.`)

  const dirHandle = await parent.getDirectoryHandle(clean, { create: true })

  // 빈 폴더 대신 README.md 를 하나 넣어 바로 열리도록 스캐폴딩한다.
  try {
    const readme = await dirHandle.getFileHandle('README.md', { create: true })
    const writable = await readme.createWritable()
    await writable.write(`# ${clean}\n\nVibe Studio로 생성한 새 프로젝트입니다.\n`)
    await writable.close()
  } catch { /* 스캐폴딩 실패는 치명적이지 않음 */ }

  const id = makeId()
  const project = await buildProject(id, dirHandle)
  await idbPut({ id, name: project.name, kind: project.kind, lastOpenedAt: project.lastOpenedAt, handle: dirHandle })
  return project
}

// 최근 프로젝트 메타 목록 (최신순)
export async function listRecent() {
  if (!isSupported()) return []
  try {
    const all = await idbGetAll()
    return all
      .map(({ id, name, kind, lastOpenedAt }) => ({ id, name, kind, lastOpenedAt }))
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  } catch {
    return []
  }
}

// 저장된 handle 로 권한 재요청 후 다시 연다.
export async function reopenProject(id) {
  const record = await idbGet(id)
  if (!record?.handle) throw new Error('저장된 프로젝트를 찾을 수 없습니다.')
  const granted = await ensurePermission(record.handle, 'read')
  if (!granted) throw new Error('폴더 접근 권한이 필요합니다. 권한을 허용해 주세요.')
  const project = await buildProject(id, record.handle)
  await idbPut({ ...record, lastOpenedAt: project.lastOpenedAt })
  return project
}

export async function removeRecent(id) {
  try { await idbDelete(id) } catch { /* 무시 */ }
}
