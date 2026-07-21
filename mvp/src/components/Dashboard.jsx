import { useState } from 'react'
import { dashboardMockData, dashboardPeriods } from '../data/dashboardData.js'

const previewStates = [
  { id: 'ready', label: '정상' }, { id: 'loading', label: '로딩' },
  { id: 'empty', label: '빈 데이터' }, { id: 'error', label: '오류' },
]

function DashboardHeader({ period, onPeriodChange, previewState, onPreviewStateChange }) {
  return (
    <div className="dash-head">
      <div><h2>대시보드</h2><p>목업 사용량과 로컬 검수 효과를 확인합니다.</p></div>
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
      <div className="dash-card skeleton chart" />
      <span className="sr-only">대시보드를 불러오는 중입니다.</span>
    </div>
  )
}

function DashboardNotice({ type, onRetry }) {
  const isError = type === 'error'
  return (
    <div className={`dash-notice ${type}`} role={isError ? 'alert' : 'status'}>
      <span className="icon">{isError ? '!' : '○'}</span>
      <strong>{isError ? '대시보드 데이터를 불러오지 못했습니다.' : '선택한 기간에 표시할 데이터가 없습니다.'}</strong>
      <p>{isError ? '잠시 후 다시 시도해 주세요.' : '다른 기간을 선택해 활동 내역을 확인해 보세요.'}</p>
      {isError && <button onClick={onRetry}>다시 시도</button>}
    </div>
  )
}

export function DashboardView({ data, status, period, onPeriodChange, previewState, onPreviewStateChange, onRetry }) {
  const max = data?.activity.length ? Math.max(...data.activity.map(item => item.value), 1) : 1
  return (
    <div className="vp-frame dark"><div className="dash">
      <DashboardHeader period={period} onPeriodChange={onPeriodChange} previewState={previewState} onPreviewStateChange={onPreviewStateChange} />
      {status === 'loading' && <DashboardLoading />}
      {status === 'empty' && <DashboardNotice type="empty" />}
      {status === 'error' && <DashboardNotice type="error" onRetry={onRetry} />}
      {status === 'ready' && <>
        <div className="dash-grid">
          {data.stats.map(item => <div className="stat" key={item.id}>
            <div className={`n ${item.tone}`}>{item.value}</div>
            <div className="l">{item.label}<span className="info-tip" tabIndex="0" data-tooltip={item.help} aria-label={item.help}>?</span></div>
          </div>)}
        </div>
        <div className="dash-card"><h3>기간별 활동</h3><div className="bars" aria-label="기간별 작업 활동 막대 차트">
          {data.activity.map(item => <div className="bar-col" key={item.x}>
            <div className="bar-v" style={{ height: `${(item.value / max) * 100}%` }} tabIndex="0" data-tooltip={item.detail} aria-label={item.detail} />
            <div className="bar-x">{item.x}</div>
          </div>)}
        </div></div>
      </>}
    </div></div>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState('30d')
  const [previewState, setPreviewState] = useState('ready')
  return <DashboardView data={dashboardMockData[period]} status={previewState} period={period} onPeriodChange={setPeriod} previewState={previewState} onPreviewStateChange={setPreviewState} onRetry={() => setPreviewState('ready')} />
}
