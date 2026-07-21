import { useState } from 'react'
import { fileTree, utilities } from '../data/mockData.js'
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

function TreeNode({ node, path, q, openMap, toggleOpen, activePath, setActivePath }) {
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
        onClick={() => (isFolder ? toggleOpen(path) : setActivePath(path))}
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
              setActivePath={setActivePath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileTree() {
  const [query, setQuery] = useState('')
  const [openMap, setOpenMap] = useState(() => initialOpenMap(fileTree))
  const [activePath, setActivePath] = useState(() => findActivePath(fileTree))

  const q = query.trim().toLowerCase()
  const folders = allFolderPaths(fileTree)
  const allOpen = folders.length > 0 && folders.every(p => openMap[p])
  const hasResult = q.length === 0 || fileTree.some(n => subtreeHasMatch(n, q))

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
        {fileTree.map((n, i) => (
          <TreeNode
            key={n.name + i}
            node={n}
            path={n.name}
            q={q}
            openMap={openMap}
            toggleOpen={toggleOpen}
            activePath={activePath}
            setActivePath={setActivePath}
          />
        ))}
        {!hasResult && <div className="tree-empty">"{query}" 검색 결과 없음</div>}
      </div>
    </>
  )
}

export default function LeftSidebar({ collapsed, onToggle }) {
  if (collapsed) {
    return (
      <aside className="rail">
        <div className="rail-head" style={{ justifyContent: 'center', padding: '12px 0' }}>
          <button className="collapse-btn" title="펼치기" onClick={onToggle}>»</button>
        </div>
        <div className="rail-mini">
          <div className="m" title="파일시스템">🗂</div>
          <div className="m" title="유틸리티">🛡</div>
          <div className="m" title="스캔">🔎</div>
          <div className="m" title="MCP">🧩</div>
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
        <FileTree />

        <div className="rail-section-label">🧰 유틸리티</div>
        <div className="util-list">
          {utilities.map((u, i) => (
            <div className="util" key={i}>
              <div className="u-ic">{u.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div className="u-t">{u.title}</div>
                <div className="u-d">{u.desc}</div>
              </div>
              {u.badge && <span className="u-badge">{u.badge}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 하단: AI 모델 선택 + 사용량 */}
      <ModelPicker />
      <UserProfile />
    </aside>
  )
}
