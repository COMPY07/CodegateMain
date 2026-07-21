import { useEffect, useRef, useState } from 'react'
import { agentRun, dashBars, csvData, samplePageHTML } from '../data/mockData.js'

function LiveWeb({ questionMode, onPick }) {
  const iframeRef = useRef(null)

  // 질문모드 상태를 프리뷰(iframe)로 전달
  useEffect(() => {
    const send = () => iframeRef.current?.contentWindow?.postMessage(
      { type: 'qmode', on: questionMode }, '*'
    )
    send()
    const t = setTimeout(send, 300) // iframe 로드 타이밍 보정
    return () => clearTimeout(t)
  }, [questionMode])

  // 프리뷰에서 온 pick 메시지 수신
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {}
      if (d.source === 'vibe-preview' && d.type === 'pick') {
        onPick({ label: d.label, selector: d.selector })
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onPick])

  return (
    <div className="vp-frame">
      <div className="bchrome">
        <span className="bdot r" /><span className="bdot y" /><span className="bdot g" />
        <div className="burl">localhost:5173 · hot-reload</div>
      </div>
      {questionMode && (
        <div className="qmode-banner">✋ 질문 모드 — 화면 요소를 클릭하면 프롬프트에 들어갑니다</div>
      )}
      <iframe
        ref={iframeRef}
        className={'vp-iframe' + (questionMode ? ' picking' : '')}
        srcDoc={samplePageHTML}
        title="live-preview"
        onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: 'qmode', on: questionMode }, '*')}
      />
    </div>
  )
}

const STATUS_META = {
  done:    { label: '완료',   cls: 'done' },
  running: { label: '진행중', cls: 'running' },
  queued:  { label: '대기',   cls: 'queued' },
}

function StepTimeline({ steps }) {
  return (
    <div className="sc-steps">
      {steps.map((s, i) => (
        <div className="cot-step" key={i}>
          <div className="cot-rail">
            <div className={'cot-node ' + s.state} />
            {i < steps.length - 1 && <div className="cot-line" />}
          </div>
          <div className="cot-body">
            <div className="cot-head">{s.head}</div>
            <div className="cot-thought">{s.thought}</div>
            {s.tool && <div className="cot-tool">⚙ {s.tool}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function SubAgentCard({ sub }) {
  const [open, setOpen] = useState(sub.status === 'running')
  const meta = STATUS_META[sub.status] || STATUS_META.queued
  const initial = sub.name.charAt(0)
  return (
    <div className={'subcard ' + meta.cls}>
      <div className="sc-head">
        <div className={'sc-av ' + meta.cls}>{initial}</div>
        <div className="sc-name">
          {sub.name}<span>{sub.role}</span>
        </div>
        <span className={'substatus ' + meta.cls}>
          {sub.status === 'running' && <span className="pulsedot" />}
          {sub.status === 'done' ? '✓ ' : ''}{meta.label}
          {sub.elapsed !== '—' ? ' · ' + sub.elapsed : ''}
        </span>
      </div>

      <div className="sc-bar"><i style={{ width: sub.progress + '%' }} /></div>

      <div className="sc-current">
        <span className="sc-order">순서 {sub.order}</span>
        {sub.status === 'queued'
          ? <span>선행: {sub.dependsOn}</span>
          : <span>▸ {sub.current}</span>}
        {sub.files.length > 0 && <span className="sc-file">{sub.files.join(', ')}</span>}
      </div>

      <button className="sc-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} 사고 흐름 {sub.steps.length}단계
      </button>
      {open && <StepTimeline steps={sub.steps} />}
    </div>
  )
}

function AgentCoT() {
  const { main, subs, title, runId } = agentRun
  const counts = subs.reduce((a, s) => (a[s.status] = (a[s.status] || 0) + 1, a), {})
  const [mainOpen, setMainOpen] = useState(true)

  return (
    <div className="vp-frame dark">
      <div className="marun">
        <div className="ma-head">
          <div>
            <div className="cot-title">◐ 멀티 에이전트 작업 현황</div>
            <div className="ma-sub">실행 #{runId} · {title}</div>
          </div>
          <div className="ma-summary">
            <span className="ma-chip done">완료 {counts.done || 0}</span>
            <span className="ma-chip running">진행중 {counts.running || 0}</span>
            <span className="ma-chip queued">대기 {counts.queued || 0}</span>
          </div>
        </div>

        {/* 메인 에이전트 */}
        <div className="ma-main">
          <div className="sc-head">
            <div className="sc-av main">O</div>
            <div className="sc-name">{main.name}<span>{main.role}</span></div>
            <span className="substatus running"><span className="pulsedot" />조율 중</span>
            <button className="sc-toggle inline" onClick={() => setMainOpen(o => !o)}>
              {mainOpen ? '접기 ▾' : '펼치기 ▸'}
            </button>
          </div>
          {mainOpen && <StepTimeline steps={main.steps} />}
        </div>

        {/* 서브 에이전트 */}
        <div className="ma-subs-label">서브 에이전트 · 동시 진행 <span>{subs.length}개</span></div>
        <div className="ma-subs">
          {subs.map(s => <SubAgentCard key={s.id} sub={s} />)}
        </div>
      </div>
    </div>
  )
}

function Dashboard() {
  const max = Math.max(...dashBars.map(b => b.v))
  return (
    <div className="vp-frame dark">
      <div className="dash">
        <h2>대시보드</h2>
        <div className="dash-grid">
          <div className="stat"><div className="n">142</div><div className="l">실행한 작업</div></div>
          <div className="stat"><div className="n green">80%</div><div className="l">토큰 절감(로컬 검수)</div></div>
          <div className="stat"><div className="n amber">7</div><div className="l">예방한 보안 이슈</div></div>
        </div>
        <div className="dash-card">
          <h3>일별 활동</h3>
          <div className="bars">
            {dashBars.map((b, i) => (
              <div className="bar-col" key={i}>
                <div className="bar-v" style={{ height: `${(b.v / max) * 100}%` }} />
                <div className="bar-x">{b.x}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CsvView() {
  return (
    <div className="vp-frame dark">
      <div className="csv-wrap">
        <table className="csv-table">
          <thead><tr>{csvData.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {csvData.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PdfView() {
  return (
    <div className="vp-frame dark">
      <div className="ph">
        <div className="big">📄</div>
        <div>report.pdf — 미리보기 (PDF 뷰어 연동 예정)</div>
      </div>
    </div>
  )
}

export default function CenterViewport({ activeTab, questionMode, onPick }) {
  switch (activeTab) {
    case 'live': return <LiveWeb questionMode={questionMode} onPick={onPick} />
    case 'cot':  return <AgentCoT />
    case 'dash': return <Dashboard />
    case 'csv':  return <CsvView />
    case 'pdf':  return <PdfView />
    default:     return <LiveWeb questionMode={questionMode} onPick={onPick} />
  }
}
