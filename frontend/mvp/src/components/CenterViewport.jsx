import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CsvViewer from './CsvViewer.jsx'
import Dashboard from './Dashboard.jsx'
import AgentProgress from './AgentProgress.jsx'
import CodeViewer from './CodeViewer.jsx'

// 프리뷰가 보낸 요소 정보를 신뢰하기 전에 형태를 검증한다.
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const sanitizeElements = (list) =>
  (Array.isArray(list) ? list : [])
    .filter(el => el && typeof el.label === 'string' && typeof el.selector === 'string')
    .map(({ label, selector }) => ({ label, selector }))

function LiveWeb({
  questionMode, regionMode, onPick, onRegionPick, previewWidth, highlightGroups = [],
  preview, project, projectsStatus, onStartPreview, onStopPreview,
}) {
  const iframeRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const previewUrl = preview?.url || null
  const previewOrigin = useMemo(() => {
    if (!previewUrl) return null
    try { return new URL(previewUrl).origin } catch { return null }
  }, [previewUrl])

  // ready 핸들러가 항상 최신 모드를 보내도록 ref 로 들고 있는다.
  const modesRef = useRef(null)
  modesRef.current = { questionMode, regionMode, highlightGroups }

  // 실제 dev server 의 정확한 origin 으로만 보낸다.
  const postToPreview = useCallback((msg) => {
    if (previewOrigin) iframeRef.current?.contentWindow?.postMessage(msg, previewOrigin)
  }, [previewOrigin])

  const syncAll = useCallback(() => {
    const m = modesRef.current
    if (!m) return
    postToPreview({ type: 'qmode', on: m.questionMode })
    postToPreview({ type: 'region', on: m.regionMode })
    postToPreview({ type: 'syncHighlights', keep: m.highlightGroups })
  }, [postToPreview])

  // 프리뷰(iframe) 실제 렌더 크기 측정 → 현재 viewport 크기 표시
  useEffect(() => {
    const el = iframeRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [previewUrl])

  // 도구 상태 변경을 프리뷰로 전달
  useEffect(() => { syncAll() }, [questionMode, regionMode, syncAll])

  // 살아있는 서클 선택 그룹 동기화 → 칩 삭제 시 파란 하이라이트 해제
  useEffect(() => {
    postToPreview({ type: 'syncHighlights', keep: highlightGroups })
  }, [highlightGroups.join(','), postToPreview])   // eslint-disable-line react-hooks/exhaustive-deps

  // 프리뷰에서 온 메시지 수신 — origin 과 payload 를 모두 검증한다.
  useEffect(() => {
    const onMsg = (e) => {
      // 1) 반드시 이 iframe 이 보낸 것이어야 한다(가장 강한 검사).
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return
      // 2) 실제 dev server 를 임베드했다면 origin 도 일치해야 한다.
      if (previewOrigin && e.origin !== previewOrigin) return

      const d = e.data || {}
      if (d.source !== 'vibe-preview') return

      if (d.type === 'ready') { syncAll(); return }

      if (d.type === 'pick') {
        if (typeof d.label !== 'string' || typeof d.selector !== 'string') return
        onPick({ label: d.label, selector: d.selector })
        return
      }
      if (d.type === 'region') {
        const r = d.rect
        if (!r || !isFiniteNumber(r.x) || !isFiniteNumber(r.y) ||
            !isFiniteNumber(r.w) || !isFiniteNumber(r.h)) return
        onRegionPick({
          groupId: isFiniteNumber(d.groupId) ? d.groupId : 0,
          rect: { x: r.x, y: r.y, w: r.w, h: r.h },
          elements: sanitizeElements(d.elements),
        })
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onPick, onRegionPick, previewOrigin, syncAll])

  const picking = questionMode || regionMode
  const frameStyle = previewWidth ? { flex: 'none', width: previewWidth, maxWidth: '100%', margin: '0 auto' } : undefined
  const starting = preview?.status === 'loading'
  const emptyTitle = projectsStatus === 'unavailable'
    ? '프로젝트 런타임을 시작하고 있습니다'
    : !project
      ? '프로젝트를 열어 주세요'
      : !project.runnable
        ? '실행 가능한 웹 프로젝트가 아닙니다'
        : preview?.status === 'error'
          ? '개발 서버를 시작하지 못했습니다'
          : '개발 서버를 준비하고 있습니다'
  const emptyDetail = projectsStatus === 'unavailable'
    ? 'Vibe Studio가 준비되면 프로젝트와 개발 서버가 자동으로 연결됩니다.'
    : !project
      ? '왼쪽 프로젝트 패널에서 기존 폴더를 열거나 React 프로젝트를 새로 만드세요.'
      : !project.runnable
        ? 'package.json과 dev 스크립트가 있는 폴더를 선택하거나 새 프로젝트를 만드세요.'
        : preview?.error || '의존성을 확인한 뒤 hot reload 서버를 자동으로 시작합니다.'

  return (
    <div className="vp-frame" style={frameStyle}>
      <div className="bchrome">
        <span className="bdot r" /><span className="bdot y" /><span className="bdot g" />
        <div className="burl">
          {previewUrl
            ? `${previewUrl.replace(/^https?:\/\//, '')} · hot-reload`
            : project?.path || '실제 프로젝트가 아직 선택되지 않았습니다'}
        </div>
        {onStartPreview && (
          previewUrl
            ? <button className="tool" title="프리뷰 중지" aria-label="프리뷰 중지" onClick={onStopPreview}>■</button>
            : <button
                className="tool"
                title="프리뷰 시작"
                aria-label="프리뷰 시작"
                onClick={onStartPreview}
                disabled={starting || !project?.runnable}
              >{starting ? '…' : '▶'}</button>
        )}
        <span className="vp-size">{size.w} × {size.h}</span>
      </div>
      {previewUrl && questionMode && (
        <div className="qmode-banner">✋ 질문 모드 — 화면 요소를 클릭하면 프롬프트에 들어갑니다</div>
      )}
      {previewUrl && regionMode && (
        <div className="qmode-banner">◯ 서클 투 서치 — 원을 그려 감싸면 그 요소들이 프롬프트에 들어갑니다</div>
      )}
      {previewUrl ? (
        <iframe
          ref={iframeRef}
          className={'vp-iframe' + (picking ? ' picking' : '')}
          src={previewUrl}
          title="live-preview"
          onLoad={syncAll}
        />
      ) : (
        <div className="preview-empty" role="status">
          <div className="preview-empty-icon" aria-hidden="true">{starting ? '···' : '⌁'}</div>
          <strong>{emptyTitle}</strong>
          <p>{emptyDetail}</p>
          {project?.runnable && !starting && onStartPreview ? (
            <button className="btn-primary" type="button" onClick={onStartPreview}>다시 시작</button>
          ) : null}
        </div>
      )}
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

export default function CenterViewport({ activeTab, questionMode, regionMode, onPick, onRegionPick, previewWidth, previewReloadKey, highlightGroups, agentRun, agentConnection, preview, project, projectId, projectsStatus, onStartPreview, onStopPreview, activeFile }) {
  const liveProps = { questionMode, regionMode, onPick, onRegionPick, previewWidth, highlightGroups, preview, project, projectsStatus, onStartPreview, onStopPreview }
  switch (activeTab) {
    case 'live': return <LiveWeb key={previewReloadKey} {...liveProps} />
    case 'cot':  return <AgentProgress run={agentRun} connection={agentConnection} />
    case 'dash': return <Dashboard />
    case 'csv':  return <CsvViewer />
    case 'pdf':  return <PdfView />
    case 'code': return <CodeViewer file={activeFile} project={projectId} />
    default:     return <LiveWeb key={previewReloadKey} {...liveProps} />
  }
}
