export default function RightPanel({ collapsed, onToggle, conversation, session, sessionName, typing }) {
  if (collapsed) {
    return (
      <aside className="right">
        <div className="rail-head" style={{ justifyContent: 'center', padding: '12px 0' }}>
          <button className="collapse-btn" title="펼치기" onClick={onToggle}>«</button>
        </div>
        <div className="right-mini">
          <div className="m">대화 · {sessionName}</div>
        </div>
      </aside>
    )
  }
  return (
    <aside className="right">
      <div className="right-head">
        <span className="t">대화</span>
        <span className="sess" title={`세션 ${session}`}>{sessionName}</span>
        <button className="collapse-btn" style={{ marginLeft: 'auto' }} title="접기" onClick={onToggle}>»</button>
      </div>
      <div className="convo">
        {conversation.map((m, i) => (
          <div className={'msg ' + m.role} key={i}>
            <div className="who">{m.role === 'q' ? '질문 · 나' : '답변 · 에이전트'}</div>
            <div className="bubble">
              {Array.isArray(m.chips) && m.chips.map((chip, chipIndex) => (
                <span className="mchip" key={`${chip.selector}-${chipIndex}`}>
                  {chip.kind === 'region' ? '🔲' : '📍'} {chip.label}
                </span>
              ))}
              {!Array.isArray(m.chips) && m.chip && <span className="mchip">📍 {m.chip}</span>}
              {(m.chip || m.chips?.length > 0) ? ' ' : ''}{m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="msg a">
            <div className="who">답변 · 에이전트</div>
            <div className="bubble"><div className="typing"><i /><i /><i /></div></div>
          </div>
        )}
      </div>
    </aside>
  )
}
