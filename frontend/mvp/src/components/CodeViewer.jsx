import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { readProjectFile } from '../api/localRuntime.js'
import { highlightCode } from '../lib/highlight.js'
import '../code-viewer.css'

export default function CodeViewer({ file, project }) {
  const [state, setState] = useState({ loading: false, entry: null, error: '' })

  useEffect(() => {
    if (!file || !project) {
      setState({ loading: false, entry: null, error: '' })
      return
    }
    const controller = new AbortController()
    setState({ loading: true, entry: null, error: '' })
    readProjectFile(project, file.path, { signal: controller.signal })
      .then(entry => setState({ loading: false, entry, error: '' }))
      .catch(error => {
        if (error?.name !== 'AbortError') {
          setState({ loading: false, entry: null, error: error?.message || '파일을 읽지 못했습니다.' })
        }
      })
    return () => controller.abort()
  }, [file, project])

  const entry = state.entry
  const isText = entry?.type === 'text'
  const isMarkdown = isText && entry.language === 'markdown'
  const source = isText ? entry.code.replace(/\n$/, '') : ''
  const lines = useMemo(() => (!isMarkdown ? source.split('\n') : []), [source, isMarkdown])
  const highlighted = useMemo(
    () => (source && !isMarkdown ? highlightCode(source, entry.language) : ''),
    [source, isMarkdown, entry?.language],
  )

  return (
    <div className="vp-frame dark">
      <div className="code-view">
        <div className="code-toolbar">
          <span className="code-icon">{file?.icon || '📄'}</span>
          <span className="code-filename" title={file?.path || ''}>{file?.name || '파일을 선택하세요'}</span>
          {entry && <span className="code-lang">{isMarkdown ? 'markdown · 리딩 뷰' : entry.language || entry.type}</span>}
          <span className="code-spacer" />
          <span className="code-local-badge">읽기 전용 · 로컬</span>
        </div>

        <div className="code-stage">
          {!file ? (
            <Empty icon="🧾" title="왼쪽 파일 트리에서 파일을 선택하세요" detail="실제 프로젝트 파일을 읽기 전용으로 표시합니다." />
          ) : state.loading ? (
            <Empty icon="⏳" title={`“${file.name}” 여는 중…`} />
          ) : state.error ? (
            <Empty icon="!" title={`“${file.name}”을 열지 못했습니다`} detail={state.error} />
          ) : !entry ? (
            <Empty icon="🗒" title="파일 미리보기를 준비하지 못했습니다" />
          ) : entry.type === 'image' ? (
            <div className="code-media"><img className="code-image" src={entry.url} alt={`${file.name} 미리보기`} /></div>
          ) : entry.type === 'pdf' ? (
            <iframe className="code-pdf" src={entry.url} title={`${file.name} 미리보기`} />
          ) : entry.type === 'binary' ? (
            <Empty icon="📦" title={`“${file.name}”은 미리볼 수 없습니다`} detail="이미지·PDF·UTF-8 텍스트 파일만 지원합니다." />
          ) : isMarkdown ? (
            <div className="md-reading"><ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.code}</ReactMarkdown></div>
          ) : (
            <div className="code-scroll">
              <div className="code-gutter" aria-hidden="true">
                {lines.map((_, index) => <span className="code-lineno" key={index}>{index + 1}</span>)}
              </div>
              <pre className="code-pre hljs"><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Empty({ icon, title, detail }) {
  return (
    <div className="code-empty" role="status">
      <span className="big">{icon}</span>
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  )
}
