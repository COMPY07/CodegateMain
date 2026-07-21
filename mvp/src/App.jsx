import { useState, useCallback, useRef, useEffect } from 'react'
import LeftSidebar from './components/LeftSidebar.jsx'
import CenterViewport from './components/CenterViewport.jsx'
import RightPanel from './components/RightPanel.jsx'
import { tabs, initialConversation } from './data/mockData.js'

// 세션별 대화 초기 상태
const makeSession = (id, convo) => ({ id, conversation: convo })

export default function App() {
  const [activeTab, setActiveTab] = useState('live')
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  // 질문 모드(포인터 툴)
  const [questionMode, setQuestionMode] = useState(false)

  // 채팅 입력 상태
  const [chips, setChips] = useState([])        // [{label, selector}]
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const inputRef = useRef(null)

  // 세션들 (추가 가능)
  const [sessions, setSessions] = useState([
    makeSession(1, initialConversation),
    makeSession(2, [{ role: 'q', text: '대시보드 차트 색을 보라로 바꿔줘' }, { role: 'a', text: '대시보드 막대 색상을 보라 그라디언트로 변경했습니다.' }]),
    makeSession(3, [{ role: 'q', text: 'CSV 데이터 불러와줘' }, { role: 'a', text: 'data.csv를 불러왔습니다. 상단 CSV 탭에서 확인하세요.' }]),
  ])
  const [activeSession, setActiveSession] = useState(1)
  const current = sessions.find(s => s.id === activeSession)

  // 질문모드에서 요소 클릭 → 칩 추가
  const handlePick = useCallback(({ label, selector }) => {
    setChips(prev => prev.some(c => c.label === label) ? prev : [...prev, { label, selector }])
    inputRef.current?.focus()
  }, [])

  const removeChip = (label) => setChips(prev => prev.filter(c => c.label !== label))

  const canSend = chips.length > 0 || text.trim().length > 0

  const send = () => {
    if (!canSend) return
    const chipLabel = chips[0]?.label
    const qText = text.trim()
    // 사용자 메시지 추가
    setSessions(prev => prev.map(s => s.id === activeSession
      ? { ...s, conversation: [...s.conversation, { role: 'q', text: qText || '(이 요소를 수정)', chip: chipLabel }] }
      : s))
    setChips([]); setText('')
    // 목업 응답
    setTyping(true)
    const anchors = chips.map(c => c.selector).join(', ')
    setTimeout(() => {
      setTyping(false)
      const reply = chipLabel
        ? `"${chipLabel}"(을)를 대상으로 작업하겠습니다. 뒤에서 해당 요소의 위치(${anchors || 'selector'})를 함께 전달받아 정확히 수정합니다. 라이브 웹 탭에서 hot-reload로 반영됩니다.`
        : `요청을 처리하겠습니다. 에이전트 CoT 탭에서 진행 상황을 확인할 수 있어요.`
      setSessions(prev => prev.map(s => s.id === activeSession
        ? { ...s, conversation: [...s.conversation, { role: 'a', text: reply }] }
        : s))
    }, 1100)
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const addSession = () => {
    const nid = Math.max(...sessions.map(s => s.id)) + 1
    setSessions(prev => [...prev, makeSession(nid, [])])
    setActiveSession(nid)
  }

  // 세션 전환 시 대기중 typing 해제
  useEffect(() => setTyping(false), [activeSession])

  // 해시 기반 초기 상태(딥링크) — 예: #cot, #dash, #q(질문모드)
  useEffect(() => {
    const h = window.location.hash.replace('#', '')
    if (!h) return
    const parts = h.split(',')
    const tabId = parts.find(p => tabs.some(t => t.id === p))
    if (tabId) setActiveTab(tabId)
    if (parts.includes('q')) { setQuestionMode(true); setActiveTab('live') }
  }, [])

  const cls = 'app' + (railCollapsed ? ' rail-collapsed' : '') + (rightCollapsed ? ' right-collapsed' : '')

  return (
    <div className={cls}>
      <LeftSidebar collapsed={railCollapsed} onToggle={() => setRailCollapsed(v => !v)} />

      <main className="center">
        {/* 상단 탭 */}
        <div className="tabbar">
          {tabs.map(t => (
            <button
              key={t.id}
              className={'tab' + (activeTab === t.id ? ' active' : '') + (t.pinned ? ' pinned' : '')}
              onClick={() => setActiveTab(t.id)}
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
          <CenterViewport activeTab={activeTab} questionMode={questionMode} onPick={handlePick} />
        </div>

        {/* 툴바 + 세션 탭 */}
        <div className="toolsbar">
          <button
            className={'tool' + (questionMode ? ' active' : '')}
            title="질문 모드 — 화면 요소를 클릭해 프롬프트에 넣기"
            onClick={() => { setQuestionMode(v => !v); if (activeTab !== 'live') setActiveTab('live') }}
          >✋</button>
          <button className="tool" title="영역 선택">▢</button>
          <button className="tool" title="주석/코멘트">✎</button>
          <div className="tool-sep" />
          <button className="tool" title="반응형 미리보기">📱</button>
          <button className="tool" title="새로고침">↻</button>

          {questionMode && <span className="qhint">✋ 클릭하면 해당 부분이 프롬프트로 들어갑니다</span>}

          <span className="tools-spacer" />

          <div className="sessions">
            <span className="slabel">세션</span>
            {sessions.map(s => (
              <button
                key={s.id}
                className={'session' + (activeSession === s.id ? ' active' : '')}
                onClick={() => setActiveSession(s.id)}
              >
                {activeSession === s.id && <span className="sdot" />}
                {s.id}
              </button>
            ))}
            <button className="session-add" title="세션 추가" onClick={addSession}>+</button>
          </div>
        </div>

        {/* 채팅 입력 */}
        <div className="chatbar">
          <div className="chatbox">
            {chips.map(c => (
              <span className="chip" key={c.label}>
                📍 {c.label}
                <span className="x" onClick={() => removeChip(c.label)}>✕</span>
              </span>
            ))}
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
        typing={typing}
      />
    </div>
  )
}
