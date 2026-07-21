import { useMemo, useState } from 'react'
import '../agent-progress.css'

const STATUS_META = {
  done: { label: '완료', symbol: '✓', cls: 'done' },
  running: { label: '진행중', symbol: '', cls: 'running' },
  queued: { label: '대기', symbol: '', cls: 'queued' },
  failed: { label: '실패', symbol: '!', cls: 'failed' },
  cancelled: { label: '취소', symbol: '×', cls: 'cancelled' },
}

const SCENARIOS = [
  { id: 'running', label: '정상 실행' },
  { id: 'failed', label: '실패' },
  { id: 'cancelled', label: '취소' },
  { id: 'empty', label: '실행 없음' },
  { id: 'disconnected', label: '연결 끊김' },
]

function makeScenario(base, scenario) {
  if (scenario === 'running') return base
  if (scenario === 'failed') {
    return {
      ...base,
      title: '로그인 페이지 리팩터링 · 검증 실패',
      main: {
        ...base.main,
        status: 'failed',
        steps: [
          ...base.main.steps.slice(0, 2).map(step => ({ ...step, state: 'done' })),
          { state: 'failed', head: '변경사항 통합 실패', thought: 'validation.ts 테스트 2건이 실패해 파일 반영을 중단했습니다.', tool: 'test validation.ts · exit 1' },
          { state: 'pending', head: '사용자 확인 대기', thought: '실패 원인을 수정한 뒤 다시 실행할 수 있습니다.' },
        ],
      },
      subs: base.subs.map((sub, index) => index === 1
        ? { ...sub, status: 'failed', progress: 72, current: '필드 검증 테스트 실패', elapsed: '0:31', steps: [...sub.steps.slice(0, 2), { state: 'failed', head: '테스트 실패', thought: '비밀번호 경계값 처리에서 예상 결과와 실제 결과가 다릅니다.', tool: '2 tests failed' }] }
        : index === 2
          ? { ...sub, status: 'cancelled', progress: 38, current: '상위 작업 실패로 실행 중단', steps: [...sub.steps.slice(0, 2), { state: 'cancelled', head: '실행 취소', thought: '의존 작업 실패로 남은 테스트 작성을 중단했습니다.' }] }
          : sub),
    }
  }
  return {
    ...base,
    title: '로그인 페이지 리팩터링 · 사용자 취소',
    main: {
      ...base.main,
      status: 'cancelled',
      steps: [
        ...base.main.steps.slice(0, 2).map(step => ({ ...step, state: 'done' })),
        { state: 'cancelled', head: '실행 취소', thought: '사용자가 실행을 취소했습니다. 완료된 변경은 적용되지 않았습니다.', tool: 'cancel run' },
      ],
    },
    subs: base.subs.map(sub => sub.status === 'done' ? sub : { ...sub, status: 'cancelled', current: '사용자 요청으로 중단', steps: [...sub.steps.filter(step => step.state === 'done'), { state: 'cancelled', head: '실행 취소', thought: '사용자 요청으로 작업을 안전하게 중단했습니다.' }] }),
  }
}

function ScenarioPicker({ value, onChange }) {
  return (
    <div className="agent-scenarios" role="group" aria-label="에이전트 실행 화면 상태">
      {SCENARIOS.map(item => <button key={item.id} className={value === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.label}</button>)}
    </div>
  )
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

export default function AgentProgress({ run }) {
  const [scenario, setScenario] = useState('running')
  const [mainOpen, setMainOpen] = useState(true)
  const displayRun = useMemo(() => makeScenario(run, scenario), [run, scenario])
  const empty = scenario === 'empty' || scenario === 'disconnected'

  if (empty) {
    return <div className="vp-frame dark"><div className="marun"><div className="agent-progress-head"><div><div className="cot-title">◐ 멀티 에이전트 작업 현황</div><div className="ma-sub">정적 상태 미리보기</div></div><ScenarioPicker value={scenario} onChange={setScenario} /></div><EmptyState disconnected={scenario === 'disconnected'} /></div></div>
  }

  const { main, subs, title, runId } = displayRun
  const counts = subs.reduce((result, sub) => ({ ...result, [sub.status]: (result[sub.status] || 0) + 1 }), {})
  return (
    <div className="vp-frame dark">
      <div className="marun">
        <div className="agent-progress-head"><div><div className="cot-title">◐ 멀티 에이전트 작업 현황</div><div className="ma-sub">실행 #{runId} · {title}</div></div><ScenarioPicker value={scenario} onChange={setScenario} /></div>
        <div className="ma-summary agent-summary">{Object.entries(STATUS_META).map(([status, meta]) => <span key={status} className={`ma-chip ${meta.cls}`}>{meta.label} {counts[status] || 0}</span>)}</div>
        <section className={`ma-main ${main.status || 'running'}`}>
          <div className="sc-head"><div className="sc-av main">O</div><div className="sc-name">{main.name}<span>{main.role}</span></div><StatusBadge status={main.status || 'running'} main /><button className="sc-toggle inline" onClick={() => setMainOpen(value => !value)}>{mainOpen ? '접기 ▾' : '펼치기 ▸'}</button></div>
          {mainOpen && <StepTimeline steps={main.steps} />}
        </section>
        <div className="ma-subs-label">서브 에이전트 · 작업 상태 <span>{subs.length}개</span></div>
        <div className="ma-subs">{subs.map(sub => <SubAgentCard key={`${scenario}-${sub.id}`} sub={sub} />)}</div>
      </div>
    </div>
  )
}
