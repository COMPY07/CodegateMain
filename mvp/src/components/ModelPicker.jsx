import { useState, useEffect, useRef } from 'react'
import { models, activeModelId } from '../data/mockData.js'

/* 브랜드 느낌의 단순화된 아이콘 글리프 (실제 로고를 모사하지 않은 기하학적 심볼) */
function Glyph({ id }) {
  const c = '#fff'
  switch (id) {
    case 'claude': // Anthropic — 방사형 버스트
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" stroke={c} strokeWidth="2.3" strokeLinecap="round">
          <line x1="12" y1="4" x2="12" y2="20" /><line x1="4" y1="12" x2="20" y2="12" />
          <line x1="6.3" y1="6.3" x2="17.7" y2="17.7" /><line x1="17.7" y1="6.3" x2="6.3" y2="17.7" />
        </svg>
      )
    case 'gpt': // OpenAI — 육각 매듭 근사
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="1.9" strokeLinejoin="round">
          <path d="M12 3.2 L19 7.1 V15.9 L12 19.8 L5 15.9 V7.1 Z" />
          <circle cx="12" cy="11.5" r="2.3" />
        </svg>
      )
    case 'gemini': // 4-포인트 스파클
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill={c}>
          <path d="M12 2 C12.7 7.6 16.4 11.3 22 12 C16.4 12.7 12.7 16.4 12 22 C11.3 16.4 7.6 12.7 2 12 C7.6 11.3 11.3 7.6 12 2 Z" />
        </svg>
      )
    case 'grok': // xAI — 슬래시 X
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" stroke={c} strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="5" x2="18" y2="19" /><line x1="18.5" y1="5.5" x2="13" y2="12.5" /><line x1="11" y1="12" x2="6" y2="18.5" />
        </svg>
      )
    case 'kimi': // Moonshot — 초승달
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill={c}>
          <path d="M15.6 3.2 A9 9 0 1 0 20.8 14.6 A7 7 0 1 1 15.6 3.2 Z" />
        </svg>
      )
    case 'mimo': // Xiaomi — 로봇 페이스
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round">
          <rect x="5" y="7.5" width="14" height="10.5" rx="3" />
          <line x1="12" y1="4" x2="12" y2="7.5" /><circle cx="9.5" cy="12.7" r="1.15" fill={c} stroke="none" /><circle cx="14.5" cy="12.7" r="1.15" fill={c} stroke="none" />
        </svg>
      )
    default:
      return null
  }
}

export function ModelTile({ m, size = 30 }) {
  return (
    <span
      className={'model-tile' + (m.bordered ? ' bordered' : '')}
      style={{ width: size, height: size, background: m.tile }}
    >
      <Glyph id={m.id} />
    </span>
  )
}

const MODEL_STORAGE_KEY = 'vibe:model'

// 새 모델 연결 안내 모달 (목업 — 실제 저장은 백엔드 BE-009 이후)
function ConnectModal({ initialId, onClose }) {
  const [modelId, setModelId] = useState(initialId || models.find(m => !m.registered)?.id || models[0].id)
  const [apiKey, setApiKey] = useState('')

  const submit = (e) => { e.preventDefault(); onClose() } // 목업: 저장하지 않음

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">새 모델 연결</span>
          <button className="modal-x" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <form onSubmit={submit}>
          <label className="modal-label">모델</label>
          <select className="modal-select" value={modelId} onChange={e => setModelId(e.target.value)}>
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.vendor}{m.registered ? ' (등록됨)' : ''}
              </option>
            ))}
          </select>

          <label className="modal-label">API 키</label>
          <input
            className="modal-input" type="password" placeholder="sk-..."
            value={apiKey} onChange={e => setApiKey(e.target.value)} autoFocus
          />

          <div className="modal-note">
            🔧 지금은 미리보기입니다 — 실제 키 등록·검증은 백엔드 연동(BE-009) 후 지원됩니다.
            입력한 키는 저장되지 않습니다.
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" disabled={!apiKey.trim()}>연결</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ModelPicker({ collapsed }) {
  const [activeId, setActiveId] = useState(() => {
    try {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY)
      // 저장된 값이 등록된 모델일 때만 복원 (미등록/삭제된 모델이면 기본값)
      if (saved && models.some(m => m.id === saved && m.registered)) return saved
    } catch { /* localStorage 접근 불가 시 무시 */ }
    return activeModelId
  })
  const [open, setOpen] = useState(false)
  const [connectFor, setConnectFor] = useState(null) // null | modelId | 'new'
  const ref = useRef(null)
  const active = models.find(m => m.id === activeId)

  // 선택 모델을 localStorage에 저장 → 새로고침 후에도 유지
  useEffect(() => {
    try { localStorage.setItem(MODEL_STORAGE_KEY, activeId) } catch { /* 무시 */ }
  }, [activeId])

  // 바깥 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 등록된 모델만 선택 가능. 미등록 모델은 선택 대신 연결 모달을 연다.
  const selectModel = (m) => {
    setOpen(false)
    if (!m.registered) { setConnectFor(m.id); return }
    setActiveId(m.id)
  }

  const menu = (
    <div className={'model-menu' + (collapsed ? ' from-mini' : '')}>
      <div className="mm-title">AI 모델 선택</div>
      {models.map(m => (
        <button
          key={m.id}
          className={'mm-item' + (m.id === activeId ? ' active' : '') + (!m.registered ? ' off' : '')}
          onClick={() => selectModel(m)}
        >
          <ModelTile m={m} size={28} />
          <span className="mm-name">{m.name}<span className="v">{m.vendor}</span></span>
          {m.registered
            ? <span className="mm-usage">{m.usage}%<span className="tk">{m.tokens}</span></span>
            : <span className="mm-off">등록 안됨</span>}
        </button>
      ))}
      <button className="mm-foot" onClick={() => { setOpen(false); setConnectFor('new') }}>
        ＋ 새 모델 연결 (API 키 등록)
      </button>
    </div>
  )

  const modal = connectFor && (
    <ConnectModal
      initialId={connectFor === 'new' ? '' : connectFor}
      onClose={() => setConnectFor(null)}
    />
  )

  if (collapsed) {
    return (
      <div className="rail-foot mini" ref={ref}>
        {open && menu}
        <button className="model-mini" title={active.name + (active.registered ? ` · ${active.usage}%` : ' · 등록 안됨')} onClick={() => setOpen(o => !o)}>
          <ModelTile m={active} size={30} />
        </button>
        {modal}
      </div>
    )
  }

  return (
    <div className="rail-foot" ref={ref}>
      {open && menu}
      <button className="model-current" onClick={() => setOpen(o => !o)}>
        <ModelTile m={active} size={32} />
        <span className="mc-info">
          <span className="mc-name">{active.name}<span className="v">{active.vendor}</span></span>
          {active.registered ? (
            <span className="mc-usage-row">
              <span className="mc-bar"><i style={{ width: active.usage + '%' }} /></span>
              <span className="mc-pct">{active.usage}% · {active.tokens}</span>
            </span>
          ) : (
            <span className="mc-off">● 등록 안됨 — 연결 필요</span>
          )}
        </span>
        <span className="mc-caret">{open ? '⌃' : '⌄'}</span>
      </button>
      {modal}
    </div>
  )
}
