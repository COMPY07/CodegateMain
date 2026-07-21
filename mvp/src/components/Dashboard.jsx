import { useState } from 'react'
import { dashboardGoal, dashboardMockData, dashboardPeriods } from '../data/dashboardData.js'

const previewStates = [
  { id: 'ready', label: '정상' }, { id: 'loading', label: '로딩' },
  { id: 'empty', label: '빈 데이터' }, { id: 'error', label: '오류' },
]

const formatTokens = value => value >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}K` : String(value)

function DashboardHeader({ period, onPeriodChange, previewState, onPreviewStateChange }) {
  return (
    <div className="dash-head">
      <div><h2>대시보드</h2><p>Goal 진행 상황과 AI 사용 정보를 확인합니다. · 목업 데이터</p></div>
      <div className="dash-controls">
        <div className="period-filter" aria-label="조회 기간">
          {dashboardPeriods.map(item => (
            <button key={item.id} className={period === item.id ? 'active' : ''} onClick={() => onPeriodChange(item.id)} aria-pressed={period === item.id}>
              {item.label}
            </button>
          ))}
        </div>
        <label className="dash-state-control">상태 미리보기
          <select value={previewState} onChange={event => onPreviewStateChange(event.target.value)}>
            {previewStates.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}

function DashboardLoading() {
  return (
    <div className="dash-loading" role="status" aria-label="대시보드 불러오는 중">
      <div className="dash-grid">{[0, 1, 2].map(item => <div className="stat skeleton" key={item} />)}</div>
      <div className="dash-content-grid"><div className="dash-card skeleton detail" /><div className="dash-card skeleton detail" /></div>
      <span className="sr-only">대시보드를 불러오는 중입니다.</span>
    </div>
  )
}

function DashboardNotice({ type, onRetry }) {
  const isError = type === 'error'
  return (
    <div className={`dash-notice ${type}`} role={isError ? 'alert' : 'status'}>
      <span className="icon">{isError ? '!' : '○'}</span>
      <strong>{isError ? '대시보드 데이터를 불러오지 못했습니다.' : '선택한 기간에 표시할 AI 사용 정보가 없습니다.'}</strong>
      <p>{isError ? '잠시 후 다시 시도해 주세요.' : '다른 기간을 선택해 사용 내역을 확인해 보세요.'}</p>
      {isError && <button onClick={onRetry}>다시 시도</button>}
    </div>
  )
}

function GoalCard({ goal }) {
  const completed = goal.steps.filter(step => step.completed).length
  const progress = Math.round((completed / goal.steps.length) * 100)
  return (
    <section className="dash-card goal-card" aria-labelledby="goal-title">
      <div className="dash-card-head">
        <div><span className="dash-eyebrow">CURRENT GOAL</span><h3 id="goal-title">{goal.title}</h3></div>
        <span className="goal-due">{goal.dueLabel}</span>
      </div>
      <p className="goal-desc">{goal.description}</p>
      <div className="goal-progress-row"><span>{completed}/{goal.steps.length} 완료</span><strong>{progress}%</strong></div>
      <div className="goal-progress" role="progressbar" aria-label="Goal 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="goal-checklist">
        {goal.steps.map(step => (
          <div className={`goal-step ${step.completed ? 'completed' : ''}`} key={step.id}>
            <input type="checkbox" checked={step.completed} disabled readOnly aria-label={step.label} />
            <span className="goal-check" aria-hidden="true">{step.completed ? '✓' : ''}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function AiUsageCard({ ai }) {
  return (
    <section className="dash-card ai-card" aria-labelledby="ai-usage-title">
      <div className="dash-card-head">
        <div><span className="dash-eyebrow">AI USAGE</span><h3 id="ai-usage-title">모델별 사용량</h3></div>
        <span className="local-badge">로컬 처리 {ai.localShare}%</span>
      </div>
      <div className="ai-metrics">
        <div><span>입력 토큰</span><strong>{formatTokens(ai.inputTokens)}</strong></div>
        <div><span>출력 토큰</span><strong>{formatTokens(ai.outputTokens)}</strong></div>
        <div><span>예상 비용</span><strong>${ai.estimatedCost.toFixed(2)}</strong></div>
      </div>
      <div className="model-usage-list">
        {ai.models.map(model => (
          <div className="model-usage" key={model.id}>
            <div className="model-usage-head"><strong>{model.name}</strong><span>{formatTokens(model.tokens)} · {model.requests}회</span></div>
            <div className="model-usage-track" aria-label={`${model.name} 사용 비중 ${model.share}%`}><span className={model.tone} style={{ width: `${model.share}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function DashboardView({ data, goal, status, period, onPeriodChange, previewState, onPreviewStateChange, onRetry }) {
  const completed = goal.steps.filter(step => step.completed).length
  const progress = Math.round((completed / goal.steps.length) * 100)
  const stats = [
    { id: 'goal', value: `${progress}%`, label: 'Goal 달성률', tone: 'purple', help: '현재 Goal의 완료된 체크 항목 비율' },
    { id: 'requests', value: String(data?.ai.requests ?? 0), label: 'AI 요청', tone: 'green', help: `최근 ${dashboardPeriods.find(item => item.id === period)?.label} 동안 실행한 AI 요청 수` },
    { id: 'tokens', value: formatTokens(data?.ai.totalTokens ?? 0), label: '총 토큰', tone: 'amber', help: '입력 토큰과 출력 토큰을 합친 목업 사용량' },
  ]

  return (
    <div className="vp-frame dark"><div className="dash">
      <DashboardHeader period={period} onPeriodChange={onPeriodChange} previewState={previewState} onPreviewStateChange={onPreviewStateChange} />
      {status === 'loading' && <DashboardLoading />}
      {status === 'empty' && <DashboardNotice type="empty" />}
      {status === 'error' && <DashboardNotice type="error" onRetry={onRetry} />}
      {status === 'ready' && <>
        <div className="dash-grid">
          {stats.map(item => <div className="stat" key={item.id}>
            <div className={`n ${item.tone}`}>{item.value}</div>
            <div className="l">{item.label}<span className="info-tip" tabIndex="0" data-tooltip={item.help} aria-label={item.help}>?</span></div>
          </div>)}
        </div>
        <div className="dash-content-grid"><GoalCard goal={goal} /><AiUsageCard ai={data.ai} /></div>
      </>}
    </div></div>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState('30d')
  const [previewState, setPreviewState] = useState('ready')

  return <DashboardView data={dashboardMockData[period]} goal={dashboardGoal} status={previewState} period={period} onPeriodChange={setPeriod} previewState={previewState} onPreviewStateChange={setPreviewState} onRetry={() => setPreviewState('ready')} />
}
