import { useState, useCallback, useRef, useEffect } from 'react'
import LeftSidebar from './components/LeftSidebar.jsx'
import { getSelectedModelId } from './components/ModelPicker.jsx'
import CenterViewport from './components/CenterViewport.jsx'
import RightPanel from './components/RightPanel.jsx'
import { NotificationProvider, useNotifications } from './components/Notifications.jsx'
import { tabs } from './data/mockData.js'
import { streamAgent } from './api/client.js'
import { useDevServer } from './hooks/useDevServer.js'
import useProjects from './hooks/useProjects.js'

// v1에는 제품 데모용 가짜 대화가 기본값으로 저장됐다. 실제 에이전트 전환과 함께
// 저장 키를 올려 그 목업이 Live 환경에 계속 나타나지 않게 한다.
const SESSION_STORAGE_KEY = 'vibe-studio.sessions.v2'
const ACTIVE_SESSION_STORAGE_KEY = 'vibe-studio.active-session.v2'

const makeSession = (id, name, conversation = []) => ({ id, name, conversation })

const createInitialSessions = () => [makeSession(1, 'New Agent 1')]

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
  const streamControllers = useRef(new Set())

  // 에이전트 실행 상태(CoT 보드) — 실행 전에는 null 이라 빈 화면이 표시된다.
  const [agentRun, setAgentRun] = useState(null)
  // 주의: 위의 `preview` 는 반응형 미리보기 프리셋이다. dev server 상태는 별도로 둔다.
  // 프로젝트·파일·dev server 는 전부 내 컴퓨터에 있고 앱의 내장 런타임이 관리한다.
  const projects = useProjects()
  const { preview: devServer, startPreview, stopPreview } = useDevServer(projects.activeProject)
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

  // 응답 대기 카운트를 1 줄인다(0 이 되면 제거).
  const decrementPending = useCallback((targetSession) => {
    setPendingReplies(prev => {
      const next = { ...prev }
      const count = (next[targetSession] || 1) - 1
      if (count > 0) next[targetSession] = count
      else delete next[targetSession]
      return next
    })
  }, [])

  // 마지막 assistant 메시지에 스트리밍 텍스트를 이어붙인다.
  const appendAssistantDelta = useCallback((targetSession, delta) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== targetSession) return s
      const conv = [...s.conversation]
      const last = conv[conv.length - 1]
      if (last && last.role === 'a') {
        conv[conv.length - 1] = { ...last, text: last.text + delta }
        return { ...s, conversation: conv }
      }
      return s
    }))
  }, [])

  // Claude Code 에이전트 스트림을 소비한다.
  // 한 연결에서 채팅 텍스트·에이전트 보드·보안 findings 가 함께 온다.
  // 대화 맥락은 백엔드의 세션별 에이전트가 유지하므로 이전 대화를 보내지 않는다.
  const runAgentReply = (targetSession, userMessage, sentChips) => {
    const controller = new AbortController()
    streamControllers.current.add(controller)

    streamAgent({
      sessionId: targetSession,
      prompt: userMessage.text,
      chips: sentChips,
      // 모델 선택기가 고른 하네스로 보낸다: claude -> Claude Code, gpt -> Codex.
      model: getSelectedModelId(),
      project: projects.active,
      signal: controller.signal,
      onRunUpdate: (run) => setAgentRun(run),
      onStart: () => {
        // 빈 assistant 버블을 추가하고 delta 로 채운다.
        setSessions(prev => prev.map(s => s.id === targetSession
          ? { ...s, conversation: [...s.conversation, { role: 'a', text: '' }] }
          : s))
      },
      onDelta: (delta) => appendAssistantDelta(targetSession, delta),
      onDone: (data) => {
        // delta 가 없었던 경우 최종 텍스트로 채운다.
        if (data?.text) {
          setSessions(prev => prev.map(s => {
            if (s.id !== targetSession) return s
            const conv = [...s.conversation]
            const last = conv[conv.length - 1]
            if (last && last.role === 'a' && !last.text) {
              conv[conv.length - 1] = { ...last, text: data.text }
              return { ...s, conversation: conv }
            }
            return s
          }))
        }
      },
      onError: (err) => notify.error(err?.message || '응답 생성에 실패했습니다.'),
    }).finally(() => {
      streamControllers.current.delete(controller)
      decrementPending(targetSession)
    })
  }

  const handleStartPreview = useCallback(async () => {
    try {
      await startPreview()
      notify.success('프리뷰 dev server 를 시작했습니다.')
    } catch (err) {
      notify.error(err?.message || 'dev server 를 시작하지 못했습니다.')
    }
  }, [startPreview, notify])

  const send = () => {
    if (!canSend) return
    if (!projects.active) {
      notify.error('먼저 왼쪽 프로젝트 패널에서 작업할 폴더를 선택해 주세요.')
      return
    }
    const targetSession = activeSession
    const sentChips = chips.map(({ kind, label, selector }) => ({ kind, label, selector }))
    const qText = text.trim()
    const userMessage = { role: 'q', text: qText || '(선택한 요소를 수정)', chips: sentChips }

    // 사용자 메시지 추가
    setSessions(prev => prev.map(s => s.id === targetSession
      ? { ...s, conversation: [...s.conversation, userMessage] }
      : s))
    setChips([]); setText('')
    setPendingReplies(prev => ({ ...prev, [targetSession]: (prev[targetSession] || 0) + 1 }))

    // Claude Code/Codex는 앱에 포함된 런타임에서 이 컴퓨터의 CLI 로그인을 쓴다.
    runAgentReply(targetSession, userMessage, sentChips)
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
    streamControllers.current.forEach(controller => controller.abort())
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
      <LeftSidebar
        projects={projects}
        collapsed={railCollapsed}
        onToggle={() => setRailCollapsed(v => !v)}
      />

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
            <span className="tab-live">
              <span className={devServer.status === 'running' ? 'live-dot' : 'live-dot off'} />
              {devServer.status === 'running' ? 'hot reload' : '대기'}
            </span>
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
            agentRun={agentRun}
            agentConnection="live"
            preview={devServer}
            project={projects.activeProject}
            projectsStatus={projects.status}
            onStartPreview={handleStartPreview}
            onStopPreview={stopPreview}
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
