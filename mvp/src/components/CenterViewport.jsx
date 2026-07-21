import { useEffect, useRef } from 'react'
import { cotSteps, dashBars, csvData, samplePageHTML } from '../data/mockData.js'

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

function AgentCoT() {
  return (
    <div className="vp-frame dark">
      <div className="cot">
        <div className="cot-title">◐ 에이전트 사고 흐름 (Chain of Thought)</div>
        {cotSteps.map((s, i) => (
          <div className="cot-step" key={i}>
            <div className="cot-rail">
              <div className={'cot-node ' + s.state} />
              {i < cotSteps.length - 1 && <div className="cot-line" />}
            </div>
            <div className="cot-body">
              <div className="cot-head">{s.head}</div>
              <div className="cot-thought">{s.thought}</div>
              {s.tool && <div className="cot-tool">⚙ {s.tool}</div>}
            </div>
          </div>
        ))}
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
