import { useState } from 'react'
import { fileTree, utilities } from '../data/mockData.js'
import ModelPicker from './ModelPicker.jsx'

function TreeNode({ node, depth }) {
  const [open, setOpen] = useState(node.open ?? false)
  const isFolder = node.type === 'folder'
  return (
    <div className="tnode">
      <div
        className={'trow' + (node.active ? ' active' : '')}
        onClick={() => isFolder && setOpen(o => !o)}
      >
        <span className="tcaret">{isFolder ? (open ? '▾' : '▸') : ''}</span>
        <span className="ticon">{isFolder ? (open ? '📂' : '📁') : (node.icon || '📄')}</span>
        <span>{node.name}</span>
      </div>
      {isFolder && open && (
        <div className="tchildren">
          {node.children.map((c, i) => <TreeNode key={i} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
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
        <div className="rail-section-label">🗂 파일시스템</div>
        <div className="tree">
          {fileTree.map((n, i) => <TreeNode key={i} node={n} depth={0} />)}
        </div>

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
    </aside>
  )
}
