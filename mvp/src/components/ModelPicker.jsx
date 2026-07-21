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

export default function ModelPicker({ collapsed }) {
  const [activeId, setActiveId] = useState(activeModelId)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = models.find(m => m.id === activeId)

  // 바깥 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const menu = (
    <div className={'model-menu' + (collapsed ? ' from-mini' : '')}>
      <div className="mm-title">AI 모델 선택</div>
      {models.map(m => (
        <button
          key={m.id}
          className={'mm-item' + (m.id === activeId ? ' active' : '') + (!m.registered ? ' off' : '')}
          onClick={() => { setActiveId(m.id); setOpen(false) }}
        >
          <ModelTile m={m} size={28} />
          <span className="mm-name">{m.name}<span className="v">{m.vendor}</span></span>
          {m.registered
            ? <span className="mm-usage">{m.usage}%<span className="tk">{m.tokens}</span></span>
            : <span className="mm-off">등록 안됨</span>}
        </button>
      ))}
      <div className="mm-foot">＋ 새 모델 연결 (API 키 등록)</div>
    </div>
  )

  if (collapsed) {
    return (
      <div className="rail-foot mini" ref={ref}>
        {open && menu}
        <button className="model-mini" title={active.name + (active.registered ? ` · ${active.usage}%` : ' · 등록 안됨')} onClick={() => setOpen(o => !o)}>
          <ModelTile m={active} size={30} />
        </button>
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
    </div>
  )
}
