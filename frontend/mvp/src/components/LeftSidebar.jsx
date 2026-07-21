import { useState, useEffect } from 'react'
import { useFileTree } from '../hooks/useFileTree.js'
import ProjectPicker from './ProjectPicker.jsx'
import ModelPicker from './ModelPicker.jsx'
import UserProfile from './UserProfile.jsx'

// 트리 경로/상태 헬퍼 (이름을 '/'로 이어 고유 경로로 사용)
const childPath = (base, name) => (base ? base + '/' + name : name)

function initialOpenMap(nodes, base = '', acc = {}) {
  nodes.forEach(n => {
    const p = childPath(base, n.name)
    if (n.type === 'folder') { acc[p] = n.open ?? false; initialOpenMap(n.children || [], p, acc) }
  })
  return acc
}
function allFolderPaths(nodes, base = '') {
  let out = []
  nodes.forEach(n => {
    const p = childPath(base, n.name)
    if (n.type === 'folder') { out.push(p); out = out.concat(allFolderPaths(n.children || [], p)) }
  })
  return out
}
function findActivePath(nodes, base = '') {
  for (const n of nodes) {
    const p = childPath(base, n.name)
    if (n.type === 'file' && n.active) return p
    if (n.type === 'folder') { const r = findActivePath(n.children || [], p); if (r) return r }
  }
  return null
}
// 노드 또는 하위 노드가 검색어와 일치하면 true (폴더 표시 여부 판단)
function subtreeHasMatch(node, q) {
  if (node.name.toLowerCase().includes(q)) return true
  if (node.type === 'folder') return (node.children || []).some(c => subtreeHasMatch(c, q))
  return false
}

function TreeNode({ node, path, q, openMap, toggleOpen, activePath, onSelectFile }) {
  const isFolder = node.type === 'folder'
  const filtering = q.length > 0
  if (filtering && !subtreeHasMatch(node, q)) return null

  // 검색 중에는 경로가 보이도록 강제로 펼침
  const open = isFolder && (filtering ? true : !!openMap[path])
  const isMatch = filtering && node.name.toLowerCase().includes(q)

  return (
    <div className="tnode">
      <div
        className={'trow' + (!isFolder && activePath === path ? ' active' : '') + (isMatch ? ' match' : '')}
        onClick={() => (isFolder ? toggleOpen(path) : onSelectFile({ path, name: node.name, icon: node.icon }))}
        title={path}
      >
        <span className="tcaret">{isFolder ? (open ? '▾' : '▸') : ''}</span>
        <span className="ticon">{isFolder ? (open ? '📂' : '📁') : (node.icon || '📄')}</span>
        <span>{node.name}</span>
      </div>
      {isFolder && open && (
        <div className="tchildren">
          {node.children.map((c, i) => (
            <TreeNode
              key={c.name + i}
              node={c}
              path={childPath(path, c.name)}
              q={q}
              openMap={openMap}
              toggleOpen={toggleOpen}
              activePath={activePath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileTree({ onOpenFile, project }) {
  const { tree: fileTree, status, error, refresh } = useFileTree(project)
  const [query, setQuery] = useState('')
  const [openMap, setOpenMap] = useState(() => initialOpenMap(fileTree))
  const [activePath, setActivePath] = useState(() => findActivePath(fileTree))

  // 실제 파일 트리는 마운트 이후 도착하므로, 도착 시 열림 상태를 다시 맞춘다.
  // (기존에 사용자가 펼쳐 둔 폴더는 유지한다.)
  useEffect(() => {
    setOpenMap(prev => ({ ...initialOpenMap(fileTree), ...prev }))
    setActivePath(prev => prev || findActivePath(fileTree))
  }, [fileTree])

  const q = query.trim().toLowerCase()
  const folders = allFolderPaths(fileTree)
  const allOpen = folders.length > 0 && folders.every(p => openMap[p])
  const hasResult = q.length === 0 || fileTree.some(n => subtreeHasMatch(n, q))

  const selectFile = (file) => {
    setActivePath(file.path)
    onOpenFile?.(file)
  }

  const toggleOpen = (path) => setOpenMap(m => ({ ...m, [path]: !m[path] }))
  const toggleAll = () => {
    const target = !allOpen
    const next = {}
    folders.forEach(p => { next[p] = target })
    setOpenMap(next)
  }

  return (
    <>
      <div className="rail-section-label">
        🗂 파일시스템
        <button className="tree-allbtn" onClick={toggleAll} title="전체 펼치기/접기">
          {allOpen ? '⊟ 접기' : '⊞ 펼치기'}
        </button>
      </div>

      <div className="tree-search">
        <span className="ts-ic">🔍</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="파일 검색…"
          aria-label="파일 검색"
        />
        {query && (
          <button className="ts-clear" onClick={() => setQuery('')} aria-label="검색 지우기">✕</button>
        )}
      </div>

      <div className="tree">
        {/* 목업 폴백이 없으므로 왜 비었는지 반드시 밝힌다. */}
        {status === 'idle' && (
          <div className="tree-empty">프로젝트를 선택하면 파일이 표시됩니다.</div>
        )}
        {status === 'loading' && fileTree.length === 0 && (
          <div className="tree-empty">불러오는 중…</div>
        )}
        {status === 'unavailable' && (
          <div className="tree-empty">
            파일을 불러오지 못했습니다.
            <button className="btn-ghost" type="button" onClick={refresh}>다시 시도</button>
          </div>
        )}
        {status === 'ready' && fileTree.length === 0 && (
          <div className="tree-empty">이 프로젝트에 파일이 없습니다.</div>
        )}
        {fileTree.map((n, i) => (
          <TreeNode
            key={n.name + i}
            node={n}
            path={n.name}
            q={q}
            openMap={openMap}
            toggleOpen={toggleOpen}
            activePath={activePath}
            onSelectFile={selectFile}
          />
        ))}
        {!hasResult && <div className="tree-empty">"{query}" 검색 결과 없음</div>}
      </div>
    </>
  )
}

export default function LeftSidebar({ collapsed, onToggle, projects, onOpenFile }) {
  if (collapsed) {
    return (
      <aside className="rail">
        <div className="rail-head" style={{ justifyContent: 'center', padding: '12px 0' }}>
          <button className="collapse-btn" title="펼치기" onClick={onToggle}>»</button>
        </div>
        <div className="rail-mini">
          <button className="m" title="파일시스템" aria-label="파일시스템 열기" onClick={onToggle}>🗂</button>
        </div>
        <div style={{ marginTop: 'auto' }} />
        <ModelPicker collapsed />
        <UserProfile collapsed />
      </aside>
    )
  }
  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="brand-badge">V</div>
        <div>
          <div className="brand-name">Vibe Studio</div>
          <div className="brand-sub">바이브 코더 스튜디오</div>
        </div>
        <button className="collapse-btn" title="접기" onClick={onToggle}>«</button>
      </div>

      <div className="rail-scroll">
        <ProjectPicker {...projects} />
        <FileTree project={projects?.active} onOpenFile={onOpenFile} />
      </div>

      {/* 하단: 실제 Claude Code / Codex 선택 */}
      <ModelPicker />
      <UserProfile />
    </aside>
  )
}
