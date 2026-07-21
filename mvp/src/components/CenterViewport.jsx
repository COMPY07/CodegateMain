import { useEffect, useRef, useState } from 'react'
import { agentRun, samplePageHTML } from '../data/mockData.js'
import CsvViewer from './CsvViewer.jsx'
import Dashboard from './Dashboard.jsx'
import AgentProgress from './AgentProgress.jsx'
import CodeViewer from './CodeViewer.jsx'

function LiveWeb({ questionMode, regionMode, onPick, onRegionPick, previewWidth, highlightGroups = [] }) {
  const iframeRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // 프리뷰(iframe) 실제 렌더 크기 측정 → 현재 viewport 크기 표시
  useEffect(() => {
    const el = iframeRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 현재 도구 상태를 프리뷰(iframe)로 전달
  useEffect(() => {
    const send = () => {
      const w = iframeRef.current?.contentWindow
      w?.postMessage({ type: 'qmode', on: questionMode }, '*')
      w?.postMessage({ type: 'region', on: regionMode }, '*')
    }
    send()
    const t = setTimeout(send, 300) // iframe 로드 타이밍 보정
    return () => clearTimeout(t)
  }, [questionMode, regionMode])

  // 프리뷰에서 온 pick / region 메시지 수신
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {}
      if (d.source !== 'vibe-preview') return
      if (d.type === 'pick') onPick({ label: d.label, selector: d.selector })
      else if (d.type === 'region') onRegionPick({ groupId: d.groupId, rect: d.rect, elements: d.elements })
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onPick, onRegionPick])

  // 살아있는 서클 선택 그룹을 iframe에 동기화 → 칩 삭제 시 파란 하이라이트 해제
  useEffect(() => {
    const send = () => iframeRef.current?.contentWindow?.postMessage(
      { type: 'syncHighlights', keep: highlightGroups }, '*'
    )
    send()
    const t = setTimeout(send, 300)
    return () => clearTimeout(t)
  }, [highlightGroups.join(',')])

  const picking = questionMode || regionMode
  const frameStyle = previewWidth ? { flex: 'none', width: previewWidth, maxWidth: '100%', margin: '0 auto' } : undefined
  return (
    <div className="vp-frame" style={frameStyle}>
      <div className="bchrome">
        <span className="bdot r" /><span className="bdot y" /><span className="bdot g" />
        <div className="burl">localhost:5173 · hot-reload</div>
        <span className="vp-size">{size.w} × {size.h}</span>
      </div>
      {questionMode && (
        <div className="qmode-banner">✋ 질문 모드 — 화면 요소를 클릭하면 프롬프트에 들어갑니다</div>
      )}
      {regionMode && (
        <div className="qmode-banner">◯ 서클 투 서치 — 원을 그려 감싸면 그 요소들이 프롬프트에 들어갑니다</div>
      )}
      <iframe
        ref={iframeRef}
        className={'vp-iframe' + (picking ? ' picking' : '')}
        srcDoc={samplePageHTML}
        title="live-preview"
        onLoad={() => {
          const w = iframeRef.current?.contentWindow
          w?.postMessage({ type: 'qmode', on: questionMode }, '*')
          w?.postMessage({ type: 'region', on: regionMode }, '*')
        }}
      />
    </div>
  )
}

function PdfView() {
  const fileInputRef = useRef(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState('page-width')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  const loadPdf = (file) => {
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError('PDF 파일만 열 수 있습니다.')
      return
    }
    setError('')
    setFileName(file.name)
    setPage(1)
    setZoom('page-width')
    setLoading(true)
    setPdfUrl(URL.createObjectURL(file))
  }

  const onFileChange = (event) => {
    loadPdf(event.target.files?.[0])
    event.target.value = ''
  }

  const onDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    loadPdf(event.dataTransfer.files?.[0])
  }

  const adjustZoom = (amount) => {
    const current = typeof zoom === 'number' ? zoom : 100
    setZoom(Math.min(200, Math.max(25, current + amount)))
  }

  const viewerSrc = pdfUrl ? `${pdfUrl}#page=${page}&zoom=${zoom}` : ''

  return (
    <div className="vp-frame dark">
      <div className="pdf-view">
        <input ref={fileInputRef} className="file-input-hidden" type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
        <div className="pdf-toolbar">
          <button className="pdf-open" onClick={() => fileInputRef.current?.click()}>PDF 열기</button>
          <span className="pdf-filename" title={fileName}>{fileName || '로컬 PDF를 선택하세요'}</span>
          <span className="pdf-local-badge">로컬 전용</span>
          <span className="pdf-spacer" />
          <button disabled={!pdfUrl || page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} aria-label="이전 페이지">‹</button>
          <label className="pdf-page-label">
            페이지
            <input
              type="number"
              min="1"
              value={page}
              disabled={!pdfUrl}
              onChange={event => setPage(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <button disabled={!pdfUrl} onClick={() => setPage(value => value + 1)} aria-label="다음 페이지">›</button>
          <span className="pdf-divider" />
          <button disabled={!pdfUrl} onClick={() => adjustZoom(-25)} aria-label="축소">−</button>
          <span className="pdf-zoom-label">{typeof zoom === 'number' ? `${zoom}%` : zoom === 'page-width' ? '너비 맞춤' : '페이지 맞춤'}</span>
          <button disabled={!pdfUrl} onClick={() => adjustZoom(25)} aria-label="확대">+</button>
          <button className={zoom === 'page-width' ? 'active' : ''} disabled={!pdfUrl} onClick={() => setZoom('page-width')}>너비</button>
          <button className={zoom === 'page-fit' ? 'active' : ''} disabled={!pdfUrl} onClick={() => setZoom('page-fit')}>맞춤</button>
        </div>

        <div
          className={'pdf-stage' + (dragging ? ' dragging' : '')}
          onDragEnter={event => { event.preventDefault(); setDragging(true) }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
          onDrop={onDrop}
        >
          {error && <div className="pdf-error" role="alert">{error}</div>}
          {!pdfUrl ? (
            <button className="pdf-empty" onClick={() => fileInputRef.current?.click()}>
              <span className="big">📄</span>
              <strong>PDF 파일을 선택하거나 여기에 놓으세요</strong>
              <span>파일은 서버로 전송되지 않고 이 브라우저에서만 열립니다.</span>
            </button>
          ) : (
            <>
              {loading && <div className="pdf-loading">PDF를 여는 중…</div>}
              <iframe
                className="pdf-frame"
                src={viewerSrc}
                title={`${fileName} 미리보기`}
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setError('브라우저에서 PDF를 표시하지 못했습니다.') }}
              />
            </>
          )}
          {dragging && <div className="pdf-drop-overlay">여기에 PDF를 놓으세요</div>}
        </div>
      </div>
    </div>
  )
}

export default function CenterViewport({ activeTab, project, questionMode, regionMode, onPick, onRegionPick, previewWidth, previewReloadKey, highlightGroups, activeFile }) {
  if (!activeTab) {
    return (
      <div className="vp-frame dark tab-empty-view">
        <span className="tab-empty-icon">＋</span>
        <strong>열린 탭이 없습니다</strong>
        <p>상단의 + 버튼에서 탭을 열거나 새 에이전트를 시작하세요.</p>
      </div>
    )
  }
  switch (activeTab) {
    case 'live': return <LiveWeb key={previewReloadKey} questionMode={questionMode} regionMode={regionMode} onPick={onPick} onRegionPick={onRegionPick} previewWidth={previewWidth} highlightGroups={highlightGroups} />
    case 'cot':  return <AgentProgress run={agentRun} />
    case 'dash': return <Dashboard />
    case 'csv':  return <CsvViewer />
    case 'pdf':  return <PdfView />
    case 'code': return <CodeViewer file={activeFile} project={project} />
    default:     return <LiveWeb key={previewReloadKey} questionMode={questionMode} regionMode={regionMode} onPick={onPick} onRegionPick={onRegionPick} previewWidth={previewWidth} highlightGroups={highlightGroups} />
  }
}
