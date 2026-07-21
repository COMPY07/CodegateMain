import { useEffect, useMemo, useRef, useState } from 'react'
import { models } from '../data/mockData.js'
import { ModelTile } from './ModelPicker.jsx'
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

function AgentModelSwitcher({ agentName, modelId, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const activeModel = models.find(model => model.id === modelId) || models[0]
  const availableModels = models.filter(model => model.registered)

  useEffect(() => {
    if (!open) return
    const close = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="agent-model" ref={ref}>
      <button
        className={'agent-model-trigger' + (open ? ' active' : '')}
        aria-label={`${agentName} 모델 변경 · 현재 ${activeModel.name}`}
        aria-expanded={open}
        title={`${activeModel.name} · 클릭하여 모델 변경`}
        onClick={() => setOpen(value => !value)}
      >
        <ModelTile m={activeModel} size={23} />
        <span>{activeModel.name}</span>
        <i>⌄</i>
      </button>
      {open && (
        <div className="agent-model-menu">
          <div className="agent-model-menu-title"><strong>모델 변경</strong><span>다음 단계부터 적용됩니다.</span></div>
          {availableModels.map(model => (
            <button
              key={model.id}
              className={model.id === modelId ? 'active' : ''}
              aria-label={`${model.name} 모델로 변경`}
              disabled={model.id === modelId}
              onClick={() => { onChange(model.id); setOpen(false) }}
            >
              <ModelTile m={model} size={25} />
              <span><strong>{model.name}</strong><small>{model.vendor}</small></span>
              {model.id === modelId && <em>현재</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ModelHandoffEvent({ event }) {
  const from = models.find(model => model.id === event.from)
  const to = models.find(model => model.id === event.to)
  if (!from || !to) return null
  return (
    <div className="model-handoff" role="status">
      <div className="model-handoff-icons"><ModelTile m={from} size={20} /><span>→</span><ModelTile m={to} size={20} /></div>
      <div><strong>{from.name} → {to.name}</strong><p>현재 단계 완료 후 컨텍스트 요약과 변경 파일을 인수인계합니다.</p></div>
      <span className="model-handoff-badge">전환 예정</span>
    </div>
  )
}

function StepTimeline({ steps, modelHistory = [] }) {
  return (
    <div className="sc-steps">
      {steps.map((step, index) => <div className="cot-step" key={`${step.head}-${index}`}>
        <div className="cot-rail"><div className={`cot-node ${step.state}`} />{index < steps.length - 1 && <div className="cot-line" />}</div>
        <div className="cot-body"><div className="cot-head">{step.head}</div><div className="cot-thought">{step.thought}</div>{step.tool && <div className="cot-tool">⚙ {step.tool}</div>}</div>
      </div>)}
      {modelHistory.map(event => <ModelHandoffEvent key={event.id} event={event} />)}
    </div>
  )
}

function StatusBadge({ status, main = false }) {
  const meta = STATUS_META[status] || STATUS_META.queued
  return <span className={`substatus ${meta.cls}`}>{status === 'running' && <span className="pulsedot" />}{meta.symbol && `${meta.symbol} `}{main && status === 'running' ? '조율 중' : meta.label}</span>
}

function SubAgentCard({ sub, modelState, onModelChange }) {
  const [open, setOpen] = useState(sub.status === 'running' || sub.status === 'failed')
  const meta = STATUS_META[sub.status] || STATUS_META.queued
  const changeModel = modelId => { setOpen(true); onModelChange(sub.id, modelId) }
  return (
    <article className={`subcard ${meta.cls}`}>
      <div className="sc-head"><div className={`sc-av ${meta.cls}`}>{sub.name.charAt(0)}</div><div className="sc-name">{sub.name}<span>{sub.role}</span></div><AgentModelSwitcher agentName={sub.name} modelId={modelState.modelId} onChange={changeModel} /><StatusBadge status={sub.status} /></div>
      <div className="sc-bar" aria-label={`진행률 ${sub.progress}%`}><i style={{ width: `${sub.progress}%` }} /></div>
      <div className="sc-current"><span className="sc-order">순서 {sub.order}</span>{sub.status === 'queued' ? <span>선행: {sub.dependsOn}</span> : <span>▸ {sub.current}</span>}{sub.files.length > 0 && <span className="sc-file">{sub.files.join(', ')}</span>}</div>
      <button className="sc-toggle" onClick={() => setOpen(value => !value)}>{open ? '▾' : '▸'} 작업 상세 {sub.steps.length}단계</button>
      {open && <StepTimeline steps={sub.steps} modelHistory={modelState.history} />}
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

const initialModelState = run => Object.fromEntries([
  ['main', { modelId: run.main.modelId || 'claude', history: [] }],
  ...run.subs.map(sub => [sub.id, { modelId: sub.modelId || 'claude', history: [] }]),
])

export default function AgentProgress({ run }) {
  const [scenario, setScenario] = useState('running')
  const [mainOpen, setMainOpen] = useState(true)
  const [agentModels, setAgentModels] = useState(() => initialModelState(run))
  const displayRun = useMemo(() => makeScenario(run, scenario), [run, scenario])
  const empty = scenario === 'empty' || scenario === 'disconnected'
  const changeAgentModel = (agentId, nextModelId) => {
    setAgentModels(current => {
      const previous = current[agentId]
      if (!previous || previous.modelId === nextModelId) return current
      const event = {
        id: `${agentId}-${previous.history.length + 1}`,
        from: previous.modelId,
        to: nextModelId,
        effective: 'next-step',
      }
      return { ...current, [agentId]: { modelId: nextModelId, history: [...previous.history, event] } }
    })
  }

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
          <div className="sc-head"><div className="sc-av main">O</div><div className="sc-name">{main.name}<span>{main.role}</span></div><AgentModelSwitcher agentName={main.name} modelId={agentModels.main.modelId} onChange={modelId => changeAgentModel('main', modelId)} /><StatusBadge status={main.status || 'running'} main /><button className="sc-toggle inline" onClick={() => setMainOpen(value => !value)}>{mainOpen ? '접기 ▾' : '펼치기 ▸'}</button></div>
          {mainOpen && <StepTimeline steps={main.steps} modelHistory={agentModels.main.history} />}
        </section>
        <div className="ma-subs-label">서브 에이전트 · 작업 상태 <span>{subs.length}개</span></div>
        <div className="ma-subs">{subs.map(sub => <SubAgentCard key={`${scenario}-${sub.id}`} sub={sub} modelState={agentModels[sub.id]} onModelChange={changeAgentModel} />)}</div>
      </div>
    </div>
  )
}
