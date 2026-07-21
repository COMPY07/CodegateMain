import { useState, useEffect, useRef } from 'react'
import { models as mockModels, activeModelId } from '../data/mockData.js'
import { useModels } from '../hooks/useModels.js'

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
    default:
      return null
  }
}

function ModelTile({ m, size = 30 }) {
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

// 선택한 모델은 곧 어느 하네스로 보낼지를 뜻한다: claude -> Claude Code, gpt -> Codex.
// App 이 요청에 실어 보내야 하므로 키 문자열을 복제하지 않도록 여기서 내보낸다.
export function getSelectedModelId() {
  try { return localStorage.getItem(MODEL_STORAGE_KEY) || 'claude' } catch { return 'claude' }
}

// 실제 모델 연결은 API 키 입력이 아니라 사용자의 로컬 CLI 로그인으로 이뤄진다.
function ConnectModal({ initialId, models, onClose, onConnected }) {
  const [modelId, setModelId] = useState(initialId || 'claude')
  const [busy, setBusy] = useState(false)
  const selected = models.find(model => model.id === modelId) || models[0]

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    await onConnected?.()
    setBusy(false)
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">로컬 CLI 연결 확인</span>
          <button className="modal-x" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <form onSubmit={submit}>
          <label className="modal-label" htmlFor="connect-model">모델</label>
          <select
            id="connect-model" className="modal-select" value={modelId}
            onChange={e => setModelId(e.target.value)}
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.id === 'claude' ? 'Claude Code' : 'Codex CLI'}
                {m.registered ? ' (사용 가능)' : ''}
              </option>
            ))}
          </select>

          <div className="modal-note">
            {selected?.id === 'claude' ? (
              <>
                <b>Claude Code 로그인</b>을 그대로 사용합니다. Vibe Studio를 시작한 터미널에서
                <code className="cot-tool">claude</code>에서 로그인해 주세요.
              </>
            ) : (
              <>
                <b>Codex의 ChatGPT 로그인</b>을 그대로 사용합니다. API 키는 필요 없습니다.
                <code className="cot-tool">codex login</code>
              </>
            )}
            {selected?.connection?.hint ? <div>현재 상태: {selected.connection.hint}</div> : null}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? '확인 중…' : '다시 확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ModelPicker({ collapsed }) {
  const { models, status, refresh } = useModels()
  const [activeId, setActiveId] = useState(() => {
    try {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY)
      if (saved && mockModels.some(m => m.id === saved)) return saved
    } catch { /* localStorage 접근 불가 시 무시 */ }
    return activeModelId
  })
  const [open, setOpen] = useState(false)
  const [connectFor, setConnectFor] = useState(null) // null | modelId | 'new'
  const ref = useRef(null)
  const active = models.find(m => m.id === activeId) || models[0] || mockModels[0]

  // 선택 모델을 localStorage에 저장 → 새로고침 후에도 유지
  useEffect(() => {
    try { localStorage.setItem(MODEL_STORAGE_KEY, activeId) } catch { /* 무시 */ }
  }, [activeId])

  // 저장된 모델이 이 컴퓨터에서 실행 불가능하면 실제 사용 가능한 CLI로 전환한다.
  useEffect(() => {
    if (status !== 'ready') return
    const current = models.find(m => m.id === activeId)
    if (current?.registered) return
    const available = models.find(m => m.registered)
    if (available) setActiveId(available.id)
  }, [models, status, activeId])

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
            ? <span className="mm-ready">사용 가능</span>
            : <span className="mm-off">연결 필요</span>}
        </button>
      ))}
      <button className="mm-foot" onClick={() => { setOpen(false); setConnectFor('new') }}>
        ↻ 로컬 CLI 연결 확인
      </button>
    </div>
  )

  const modal = connectFor && (
    <ConnectModal
      initialId={connectFor === 'new' ? '' : connectFor}
      models={models}
      onConnected={refresh}
      onClose={() => setConnectFor(null)}
    />
  )

  if (collapsed) {
    return (
      <div className="rail-foot mini" ref={ref}>
        {open && menu}
        <button className="model-mini" title={`${active.name} · ${active.registered ? '로컬 CLI 연결됨' : '연결 필요'}`} onClick={() => setOpen(o => !o)}>
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
          {active.registered
            ? <span className="mc-ready">● 사용 가능</span>
            : <span className="mc-off">● CLI 로그인 필요</span>}
        </span>
        <span className="mc-caret">{open ? '⌃' : '⌄'}</span>
      </button>
      {modal}
    </div>
  )
}
