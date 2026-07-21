import { useState } from 'react'
import '../agent-progress.css'

const STATUS_META = {
  done: { label: '완료', symbol: '✓', cls: 'done' },
  running: { label: '진행중', symbol: '', cls: 'running' },
  queued: { label: '대기', symbol: '', cls: 'queued' },
  failed: { label: '실패', symbol: '!', cls: 'failed' },
  cancelled: { label: '취소', symbol: '×', cls: 'cancelled' },
}

function StepTimeline({ steps }) {
  return (
    <div className="sc-steps">
      {steps.map((step, index) => <div className="cot-step" key={`${step.head}-${index}`}>
        <div className="cot-rail"><div className={`cot-node ${step.state}`} />{index < steps.length - 1 && <div className="cot-line" />}</div>
        <div className="cot-body"><div className="cot-head">{step.head}</div><div className="cot-thought">{step.thought}</div>{step.tool && <div className="cot-tool">⚙ {step.tool}</div>}</div>
      </div>)}
    </div>
  )
}

function StatusBadge({ status, main = false }) {
  const meta = STATUS_META[status] || STATUS_META.queued
  return <span className={`substatus ${meta.cls}`}>{status === 'running' && <span className="pulsedot" />}{meta.symbol && `${meta.symbol} `}{main && status === 'running' ? '조율 중' : meta.label}</span>
}

function SubAgentCard({ sub }) {
  const [open, setOpen] = useState(sub.status === 'running' || sub.status === 'failed')
  const meta = STATUS_META[sub.status] || STATUS_META.queued
  return (
    <article className={`subcard ${meta.cls}`}>
      <div className="sc-head"><div className={`sc-av ${meta.cls}`}>{sub.name.charAt(0)}</div><div className="sc-name">{sub.name}<span>{sub.role}</span></div><StatusBadge status={sub.status} /></div>
      <div className="sc-bar" aria-label={`진행률 ${sub.progress}%`}><i style={{ width: `${sub.progress}%` }} /></div>
      <div className="sc-current"><span className="sc-order">순서 {sub.order}</span>{sub.status === 'queued' ? <span>선행: {sub.dependsOn}</span> : <span>▸ {sub.current}</span>}{sub.files.length > 0 && <span className="sc-file">{sub.files.join(', ')}</span>}</div>
      <button className="sc-toggle" onClick={() => setOpen(value => !value)}>{open ? '▾' : '▸'} 작업 상세 {sub.steps.length}단계</button>
      {open && <StepTimeline steps={sub.steps} />}
    </article>
  )
}

function EmptyState({ disconnected }) {
  return (
    <div className={`agent-empty ${disconnected ? 'disconnected' : ''}`} role="status">
      <span className="agent-empty-icon">{disconnected ? '⚡' : '◐'}</span>
      <strong>{disconnected ? '에이전트 연결이 끊겼습니다' : '진행 중인 에이전트 실행이 없습니다'}</strong>
      <p>{disconnected ? '마지막 상태를 불러올 수 없습니다. 연결이 복구되면 진행 화면이 자동으로 갱신됩니다.' : '새 요청을 보내면 작업 단계와 에이전트별 진행 상황이 여기에 표시됩니다.'}</p>
      {disconnected && <span className="agent-retry-note"><i /> 재연결 대기 중</span>}
    </div>
  )
}

export default function AgentProgress({ run, connection = 'live' }) {
  const [mainOpen, setMainOpen] = useState(true)

  // 빈/끊김 판정은 run 을 건드리기 전에 해야 한다.
  // (실행 중이 아닐 때 run 은 null 이다.)
  if (connection === 'disconnected' || !run || !run.main) {
    return (
      <div className="vp-frame dark">
        <div className="marun">
          <div className="agent-progress-head">
            <div>
              <div className="cot-title">◐ 멀티 에이전트 작업 현황</div>
              <div className="ma-sub">대기 중</div>
            </div>
          </div>
          <EmptyState disconnected={connection === 'disconnected'} />
        </div>
      </div>
    )
  }

  const { main, subs = [], title, runId } = run
  const counts = subs.reduce((result, sub) => ({ ...result, [sub.status]: (result[sub.status] || 0) + 1 }), {})
  return (
    <div className="vp-frame dark">
      <div className="marun">
        <div className="agent-progress-head"><div><div className="cot-title">◐ 멀티 에이전트 작업 현황</div><div className="ma-sub">실행 #{runId} · {title}</div></div></div>
        <div className="ma-summary agent-summary">{Object.entries(STATUS_META).map(([status, meta]) => <span key={status} className={`ma-chip ${meta.cls}`}>{meta.label} {counts[status] || 0}</span>)}</div>
        <section className={`ma-main ${main.status || 'running'}`}>
          <div className="sc-head"><div className="sc-av main">O</div><div className="sc-name">{main.name}<span>{main.role}</span></div><StatusBadge status={main.status || 'running'} main /><button className="sc-toggle inline" onClick={() => setMainOpen(value => !value)}>{mainOpen ? '접기 ▾' : '펼치기 ▸'}</button></div>
          {mainOpen && <StepTimeline steps={main.steps} />}
        </section>
        <div className="ma-subs-label">서브 에이전트 · 작업 상태 <span>{subs.length}개</span></div>
        {/* key 는 sub.id 만 사용한다 — 접두사를 붙이면 갱신마다 카드가 리마운트돼 펼침 상태가 초기화된다. */}
        <div className="ma-subs">{subs.map(sub => <SubAgentCard key={sub.id} sub={sub} />)}</div>
      </div>
    </div>
  )
}
