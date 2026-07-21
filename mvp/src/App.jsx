import { useState, useCallback, useRef, useEffect } from 'react'
import LeftSidebar from './components/LeftSidebar.jsx'
import CenterViewport from './components/CenterViewport.jsx'
import RightPanel from './components/RightPanel.jsx'
import { NotificationProvider, useNotifications } from './components/Notifications.jsx'
import { tabs, initialConversation } from './data/mockData.js'

const SESSION_STORAGE_KEY = 'vibe-studio.sessions.v1'
const ACTIVE_SESSION_STORAGE_KEY = 'vibe-studio.active-session.v1'

const makeSession = (id, name, conversation = []) => ({ id, name, conversation })

const createInitialSessions = () => [
  makeSession(1, '첫 작업', initialConversation),
  makeSession(2, '대시보드 색상', [{ role: 'q', text: '대시보드 차트 색을 보라로 바꿔줘' }, { role: 'a', text: '대시보드 막대 색상을 보라 그라디언트로 변경했습니다.' }]),
  makeSession(3, 'CSV 불러오기', [{ role: 'q', text: 'CSV 데이터 불러와줘' }, { role: 'a', text: 'data.csv를 불러왔습니다. 상단 CSV 탭에서 확인하세요.' }]),
]

const loadSessions = () => {
  if (typeof window === 'undefined') return createInitialSessions()
  try {
    const saved = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY))
    if (!Array.isArray(saved) || saved.length === 0) return createInitialSessions()
    const sessions = saved.filter(s => Number.isInteger(s?.id) && Array.isArray(s?.conversation)).map(s => ({
      id: s.id,
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `세션 ${s.id}`,
      conversation: s.conversation
        .filter(m => (m?.role === 'q' || m?.role === 'a') && typeof m?.text === 'string')
        .map(m => ({
          role: m.role,
          text: m.text,
          ...(Array.isArray(m.chips) ? {
            chips: m.chips.filter(c => typeof c?.label === 'string' && typeof c?.selector === 'string'),
          } : {}),
          ...(!Array.isArray(m.chips) && typeof m.chip === 'string' ? { chip: m.chip } : {}),
        })),
    }))
    return sessions.length > 0 ? sessions : createInitialSessions()
  } catch {
    return createInitialSessions()
  }
}

// 반응형 미리보기 프리셋 (width=null 이면 전체 폭)
const PREVIEW_PRESETS = [
  { id: 'desktop', label: '데스크톱', sub: '전체 폭', width: null },
  { id: 'tablet',  label: '태블릿',   sub: '768 px', width: 768 },
  { id: 'mobile',  label: '모바일',   sub: '375 px', width: 375 },
]

const readNavigationHash = () => {
  if (typeof window === 'undefined') return { tab: 'live', tool: 'none' }
  const parts = window.location.hash.replace(/^#/, '').split(',').filter(Boolean)
  const tab = parts.find(part => tabs.some(item => item.id === part)) || 'live'
  if (parts.includes('q') || parts.includes('question')) return { tab: 'live', tool: 'question' }
  if (parts.includes('region')) return { tab: 'live', tool: 'region' }
  return { tab, tool: 'none' }
}

const navigationKey = ({ tab, tool }) => `${tab}:${tool}`
const navigationHash = (tab, tool) => `#${tab}${tab === 'live' && tool === 'question' ? ',q' : tab === 'live' && tool === 'region' ? ',region' : ''}`
const isMobileViewport = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches

export function AppContent() {
  const notify = useNotifications()
  const initialNavigation = useRef(readNavigationHash()).current
  const navigationStateRef = useRef(navigationKey(initialNavigation))
  const [activeTab, setActiveTab] = useState(initialNavigation.tab)
  const [railCollapsed, setRailCollapsed] = useState(isMobileViewport)
  const [rightCollapsed, setRightCollapsed] = useState(isMobileViewport)

  // 활성 도구: 'none' | 'question'(질문 모드) | 'region'(영역 선택)
  // 서로 배타적 — 하나를 켜면 나머지는 꺼진다
  const [activeTool, setActiveTool] = useState(initialNavigation.tool)
  const questionMode = activeTool === 'question'
  const regionMode = activeTool === 'region'
  const toggleTool = (tool) => setActiveTool(t => (t === tool ? 'none' : tool))
  const selectTab = (tab) => {
    setActiveTab(tab)
    if (tab !== 'live') setActiveTool('none')
  }

  // 채팅 입력 상태
  const [chips, setChips] = useState([])        // [{id, kind:'element'|'region', label, selector, region?}]
  const chipId = useRef(1)
  const draggedChipIdRef = useRef(null)
  const [draggedChipId, setDraggedChipId] = useState(null)
  const [text, setText] = useState('')
  const inputRef = useRef(null)
  const sessionNameInputRef = useRef(null)
  const [editingSessionId, setEditingSessionId] = useState(null)

  // 반응형 미리보기 상태
  const [preview, setPreview] = useState({ preset: 'desktop', width: null })
  const [deviceOpen, setDeviceOpen] = useState(false)
  const [customW, setCustomW] = useState('')
  const deviceRef = useRef(null)
  const [previewReloadKey, setPreviewReloadKey] = useState(0)

  // 세션과 대화는 브라우저에 저장하고, 응답 대기 상태는 현재 실행 중에만 유지한다.
  const [sessions, setSessions] = useState(loadSessions)
  const [activeSession, setActiveSession] = useState(() => {
    const saved = Number(window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY))
    return Number.isInteger(saved) ? saved : 1
  })
  const [pendingReplies, setPendingReplies] = useState({})
  const replyTimers = useRef(new Set())
  const current = sessions.find(s => s.id === activeSession)
  const typing = (pendingReplies[activeSession] || 0) > 0

  // 질문모드에서 요소 클릭 → 칩 추가 (같은 요소는 중복 방지)
  const handlePick = useCallback(({ label, selector }) => {
    setChips(prev => prev.some(c => c.selector === selector)
      ? prev
      : [...prev, { id: chipId.current++, kind: 'element', label, selector }])
    inputRef.current?.focus()
  }, [])

  // 서클 투 서치 완료 → 감싼 요소 목록을 칩으로 추가 (groupId로 파란 하이라이트 연동)
  const handleRegionPick = useCallback(({ groupId, rect, elements }) => {
    const count = elements.length
    const label = count > 0 ? `서클 선택 · ${count}개 요소` : '서클 선택(빈 영역)'
    const box = `circle(${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.w)}×${Math.round(rect.h)})`
    const selector = count > 0 ? `${box} ⊃ ${elements.map(e => e.selector).join(', ')}` : box
    setChips(prev => prev.some(c => c.selector === selector)
      ? prev
      : [...prev, { id: chipId.current++, kind: 'region', label, selector, groupId, region: { rect, elements } }])
    inputRef.current?.focus()
  }, [])

  const removeChip = (id) => setChips(prev => prev.filter(c => c.id !== id))

  // 현재 칩에 살아있는 서클 선택 그룹 → iframe 파란 하이라이트와 동기화
  const highlightGroups = chips.filter(c => c.kind === 'region' && c.groupId).map(c => c.groupId)

  const reorderChip = (targetId) => {
    const sourceId = draggedChipIdRef.current
    if (sourceId === null || sourceId === targetId) return
    setChips(prev => {
      const from = prev.findIndex(c => c.id === sourceId)
      const to = prev.findIndex(c => c.id === targetId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  // 반응형 미리보기 프리셋 선택
  const choosePreset = (p) => {
    setPreview({ preset: p.id, width: p.width })
    setDeviceOpen(false)
    if (activeTab !== 'live') setActiveTab('live')
  }
  const applyCustomWidth = () => {
    const w = parseInt(customW, 10)
    if (!Number.isFinite(w) || w < 240) return   // 최소 240px
    setPreview({ preset: 'custom', width: w })
    setDeviceOpen(false)
    if (activeTab !== 'live') setActiveTab('live')
  }

  const canSend = chips.length > 0 || text.trim().length > 0

  const send = () => {
    if (!canSend) return
    const targetSession = activeSession
    const sentChips = chips.map(({ kind, label, selector }) => ({ kind, label, selector }))
    const qText = text.trim()
    // 사용자 메시지 추가
    setSessions(prev => prev.map(s => s.id === targetSession
      ? { ...s, conversation: [...s.conversation, { role: 'q', text: qText || '(선택한 요소를 수정)', chips: sentChips }] }
      : s))
    setChips([]); setText('')
    // 목업 응답
    setPendingReplies(prev => ({ ...prev, [targetSession]: (prev[targetSession] || 0) + 1 }))
    const anchors = chips.map(c => c.selector).join(', ')
    const timer = setTimeout(() => {
      replyTimers.current.delete(timer)
      const reply = sentChips.length > 0
        ? `${sentChips.map(c => `"${c.label}"`).join(', ')} 총 ${sentChips.length}개 대상을 작업하겠습니다. 뒤에서 해당 요소의 위치(${anchors || 'selector'})를 함께 전달받아 정확히 수정합니다. 라이브 웹 탭에서 hot-reload로 반영됩니다.`
        : `요청을 처리하겠습니다. 에이전트 CoT 탭에서 진행 상황을 확인할 수 있어요.`
      setSessions(prev => prev.map(s => s.id === targetSession
        ? { ...s, conversation: [...s.conversation, { role: 'a', text: reply }] }
        : s))
      setPendingReplies(prev => {
        const next = { ...prev }
        const count = (next[targetSession] || 1) - 1
        if (count > 0) next[targetSession] = count
        else delete next[targetSession]
        return next
      })
    }, 1100)
    replyTimers.current.add(timer)
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const addSession = () => {
    const nid = Math.max(...sessions.map(s => s.id)) + 1
    const defaultName = `New Agent ${nid}`
    setSessions(prev => [...prev, makeSession(nid, defaultName)])
    setActiveSession(nid)
    setEditingSessionId(nid)
  }

  const beginSessionRename = (sessionId) => {
    setActiveSession(sessionId)
    setEditingSessionId(sessionId)
  }

  const commitSessionName = (sessionId, value) => {
    const trimmed = value.trim()
    const fallback = `New Agent ${sessionId}`
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, name: trimmed || fallback } : s))
    setEditingSessionId(null)
  }

  const deleteSession = async () => {
    if (sessions.length === 1) {
      notify.warning('마지막 세션은 삭제할 수 없습니다.')
      return
    }
    if ((pendingReplies[activeSession] || 0) > 0) {
      notify.warning('응답을 기다리는 세션은 삭제할 수 없습니다. 응답이 완료된 후 다시 시도하세요.')
      return
    }
    const sessionName = current?.name || `세션 ${activeSession}`
    const accepted = await notify.confirm({
      title: '세션 삭제',
      message: `"${sessionName}" 세션과 대화를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      danger: true,
    })
    if (!accepted) return
    const index = sessions.findIndex(s => s.id === activeSession)
    const nextActive = sessions[index + 1] || sessions[index - 1]
    setSessions(prev => prev.filter(s => s.id !== activeSession))
    setActiveSession(nextActive.id)
    notify.success(`"${sessionName}" 세션을 삭제했습니다.`)
  }

  useEffect(() => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    if (!sessions.some(s => s.id === activeSession)) {
      setActiveSession(sessions[0].id)
      return
    }
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(activeSession))
  }, [activeSession, sessions])

  useEffect(() => {
    if (editingSessionId === null) return
    sessionNameInputRef.current?.focus()
    sessionNameInputRef.current?.select()
  }, [editingSessionId])

  useEffect(() => () => {
    replyTimers.current.forEach(timer => clearTimeout(timer))
  }, [])

  // 반응형 미리보기 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!deviceOpen) return
    const onDoc = (e) => { if (deviceRef.current && !deviceRef.current.contains(e.target)) setDeviceOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [deviceOpen])

  // 뒤로가기/앞으로가기 또는 직접 입력한 hash를 탭과 도구 상태로 복원한다.
  useEffect(() => {
    const restoreNavigation = () => {
      const next = readNavigationHash()
      navigationStateRef.current = navigationKey(next)
      setActiveTab(next.tab)
      setActiveTool(next.tool)
    }
    window.addEventListener('popstate', restoreNavigation)
    window.addEventListener('hashchange', restoreNavigation)
    return () => {
      window.removeEventListener('popstate', restoreNavigation)
      window.removeEventListener('hashchange', restoreNavigation)
    }
  }, [])

  // 사용자 조작으로 상태가 바뀌면 history 항목을 추가한다.
  useEffect(() => {
    const nextState = navigationKey({ tab: activeTab, tool: activeTool })
    if (navigationStateRef.current === nextState) return
    navigationStateRef.current = nextState
    window.history.pushState(null, '', navigationHash(activeTab, activeTool))
  }, [activeTab, activeTool])

  // 작은 화면에 진입하면 패널을 drawer의 닫힌 상태로 전환한다.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)')
    const onViewportChange = (event) => {
      if (event.matches) {
        setRailCollapsed(true)
        setRightCollapsed(true)
      }
    }
    media.addEventListener('change', onViewportChange)
    return () => media.removeEventListener('change', onViewportChange)
  }, [])

  const cls = 'app' + (railCollapsed ? ' rail-collapsed' : '') + (rightCollapsed ? ' right-collapsed' : '')

  return (
    <div className={cls}>
      {(!railCollapsed || !rightCollapsed) && (
        <button
          className="drawer-backdrop"
          aria-label="열린 패널 닫기"
          onClick={() => { setRailCollapsed(true); setRightCollapsed(true) }}
        />
      )}
      <LeftSidebar collapsed={railCollapsed} onToggle={() => setRailCollapsed(v => !v)} />

      <main className="center">
        {/* 상단 탭 */}
        <div className="tabbar">
          <div className="mobile-panel-buttons">
            <button
              className="mobile-panel-button"
              aria-label="파일 패널 열기"
              onClick={() => { setRailCollapsed(false); setRightCollapsed(true) }}
            >☰</button>
            <button
              className="mobile-panel-button"
              aria-label="대화 패널 열기"
              onClick={() => { setRightCollapsed(false); setRailCollapsed(true) }}
            >💬</button>
          </div>
          {tabs.map(t => (
            <button
              key={t.id}
              className={'tab' + (activeTab === t.id ? ' active' : '') + (t.pinned ? ' pinned' : '')}
              onClick={() => selectTab(t.id)}
            >
              <span className="dot" style={{ background: t.dot }} />
              <span>{t.label}</span>
              {t.pinned && <span className="pin" title="고정 탭">📌</span>}
            </button>
          ))}
          <span className="tab-spacer" />
          {activeTab === 'live' && (
            <span className="tab-live"><span className="live-dot" /> 라이브</span>
          )}
        </div>

        {/* 메인 뷰포트 */}
        <div className="viewport">
          <CenterViewport
            activeTab={activeTab}
            questionMode={questionMode}
            regionMode={regionMode}
            onPick={handlePick}
            onRegionPick={handleRegionPick}
            previewWidth={preview.width}
            previewReloadKey={previewReloadKey}
            highlightGroups={highlightGroups}
          />
        </div>

        {/* 툴바 + 세션 탭 */}
        <div className="toolsbar">
          <button
            className={'tool' + (questionMode ? ' active' : '')}
            title="질문 모드 — 화면 요소를 클릭해 프롬프트에 넣기"
            onClick={() => { toggleTool('question'); if (activeTab !== 'live') setActiveTab('live') }}
          >✋</button>
          <button
            className={'tool' + (regionMode ? ' active' : '')}
            title="서클 투 서치 — 원을 그려 감싼 요소를 프롬프트에 넣기"
            onClick={() => { toggleTool('region'); if (activeTab !== 'live') setActiveTab('live') }}
          >◯</button>
          <div className="tool-sep" />
          <div className="device-wrap" ref={deviceRef}>
            <button
              className={'tool' + (preview.preset !== 'desktop' ? ' active' : '')}
              title="반응형 미리보기"
              onClick={() => { setDeviceOpen(o => !o); if (activeTab !== 'live') setActiveTab('live') }}
            >📱</button>
            {deviceOpen && (
              <div className="device-menu">
                <div className="mm-title">화면 크기</div>
                {PREVIEW_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={'dm-item' + (preview.preset === p.id ? ' active' : '')}
                    onClick={() => choosePreset(p)}
                  >
                    <span className="dm-name">{p.label}</span>
                    <span className="dm-sub">{p.sub}</span>
                  </button>
                ))}
                <div className="dm-custom">
                  <input
                    type="number" min="240" placeholder="직접 입력"
                    value={customW}
                    onChange={e => setCustomW(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') applyCustomWidth() }}
                  />
                  <span className="dm-unit">px</span>
                  <button className="dm-apply" onClick={applyCustomWidth}>적용</button>
                </div>
              </div>
            )}
          </div>
          <button
            className="tool"
            title="프리뷰 새로고침"
            aria-label="프리뷰 새로고침"
            onClick={() => setPreviewReloadKey(key => key + 1)}
          >↻</button>

          {questionMode && <span className="qhint">✋ 클릭하면 해당 부분이 프롬프트로 들어갑니다</span>}
          {regionMode && <span className="qhint">◯ 원을 그려 감싸면 그 요소들이 프롬프트로 들어갑니다</span>}

          <span className="tools-spacer" />

          <div className="sessions">
            <span className="slabel">세션</span>
            {sessions.map(s => editingSessionId === s.id ? (
              <div key={s.id} className="session active editing">
                <span className="sdot" />
                <input
                  ref={sessionNameInputRef}
                  defaultValue={s.name}
                  aria-label="세션 이름"
                  onBlur={event => commitSessionName(s.id, event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      event.currentTarget.value = s.name
                      event.currentTarget.blur()
                    }
                  }}
                />
              </div>
            ) : (
              <button
                key={s.id}
                className={'session' + (activeSession === s.id ? ' active' : '')}
                onClick={() => setActiveSession(s.id)}
                onDoubleClick={() => beginSessionRename(s.id)}
                onKeyDown={event => {
                  if (event.key === 'F2') {
                    event.preventDefault()
                    beginSessionRename(s.id)
                  }
                }}
                title={`${s.name} · 더블클릭 또는 F2로 이름 변경`}
              >
                {(activeSession === s.id || pendingReplies[s.id]) && <span className={'sdot' + (pendingReplies[s.id] ? ' pending' : '')} />}
                <span className="session-name">{s.name}</span>
              </button>
            ))}
            <button className="session-add" title="세션 추가" onClick={addSession}>+</button>
            <button className="session-action danger" title="현재 세션 삭제" aria-label="현재 세션 삭제" onClick={deleteSession}>×</button>
          </div>
        </div>

        {/* 채팅 입력 */}
        <div className="chatbar">
          <div className="chatbox">
            {chips.map(c => (
              <span
                className={'chip' + (c.kind === 'region' ? ' region' : '') + (draggedChipId === c.id ? ' dragging' : '')}
                key={c.id}
                draggable
                onDragStart={e => {
                  draggedChipIdRef.current = c.id
                  setDraggedChipId(c.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', String(c.id))
                }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={e => { e.preventDefault(); reorderChip(c.id) }}
                onDragEnd={() => {
                  draggedChipIdRef.current = null
                  setDraggedChipId(null)
                }}
                title="드래그하여 순서 변경"
              >
                {c.kind === 'region' ? '🔲' : '📍'} {c.label}
                <button className="x" type="button" aria-label={`${c.label} 칩 삭제`} onClick={() => removeChip(c.id)}>✕</button>
              </span>
            ))}
            {chips.length > 0 && (
              <button className="chips-clear" type="button" onClick={() => setChips([])}>전체 삭제</button>
            )}
            <input
              ref={inputRef}
              className="chat-input"
              placeholder={chips.length ? '이어서 설명하세요…' : 'Text — 무엇을 만들까요?'}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKey}
            />
            <button className="send-btn" disabled={!canSend} onClick={send}>↑</button>
          </div>
          <div className="chat-sub">
            Enter 전송 · 칩은 클릭한 요소의 이름 — 뒤에서 AI는 요소의 위치·파일까지 함께 전달받습니다
          </div>
        </div>
      </main>

      <RightPanel
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed(v => !v)}
        conversation={current?.conversation || []}
        session={activeSession}
        sessionName={current?.name || `세션 ${activeSession}`}
        typing={typing}
      />
    </div>
  )
}

export default function App() {
  return <NotificationProvider><AppContent /></NotificationProvider>
}
