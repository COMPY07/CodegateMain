import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fileContents } from '../data/mockData.js'
import { highlightCode } from '../lib/highlight.js'
import '../code-viewer.css'

// 트리에서 선택한 파일 내용을 PDF 뷰처럼 읽기 전용으로 보여준다.
// - 프로젝트가 열려 있으면 project.readFile 로 실제 로컬 파일을 읽는다.
// - 프로젝트가 없으면(폴백) mockData 의 데모용 정적 내용을 보여준다.
// - 코드: highlight.js 문법 강조 + 라인 번호
// - 마크다운: react-markdown 으로 옵시디언 리딩 뷰처럼 렌더링
export default function CodeViewer({ file, project }) {
  const name = file ? file.name : ''

  // 실제 프로젝트 파일은 비동기로 읽는다. 없으면 목업으로 폴백한다.
  const [loaded, setLoaded] = useState(null)   // { language, code } | null
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!file || !project?.readFile) { setLoaded(null); return }
    let alive = true
    setLoading(true)
    project.readFile(file.path)
      .then(result => { if (alive) setLoaded(result) })
      .catch(() => { if (alive) setLoaded(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [file, project])

  // 이미지·PDF 미리보기용 blob URL 은 다 쓰면 해제한다.
  useEffect(() => {
    const url = loaded?.url
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [loaded])

  const entry = project?.readFile ? loaded : (file ? fileContents[file.path] : null)
  // 목업 폴백 항목은 type 이 없으므로 기본을 'text' 로 본다.
  const type = entry ? (entry.type || 'text') : null
  const isText = type === 'text'
  const isMarkdown = isText && entry?.language === 'markdown'

  const lines = useMemo(
    () => (isText && !isMarkdown ? entry.code.replace(/\n$/, '').split('\n') : []),
    [entry, isText, isMarkdown],
  )
  const highlighted = useMemo(
    () => (isText && !isMarkdown ? highlightCode(entry.code.replace(/\n$/, ''), entry.language) : ''),
    [entry, isText, isMarkdown],
  )

  return (
    <div className="vp-frame dark">
      <div className="code-view">
        <div className="code-toolbar">
          <span className="code-icon">{file?.icon || '📄'}</span>
          <span className="code-filename" title={file?.path || ''}>
            {name || '파일을 선택하세요'}
          </span>
          {entry && (
            <span className="code-lang">
              {isMarkdown ? 'markdown · 리딩 뷰'
                : type === 'image' ? '이미지'
                : type === 'pdf' ? 'PDF'
                : type === 'binary' ? '바이너리'
                : (entry.language || 'text')}
            </span>
          )}
          <span className="code-spacer" />
          <span className="code-local-badge">{project?.readFile ? '읽기 전용 · 로컬' : '읽기 전용 · 목업'}</span>
        </div>

        <div className="code-stage">
          {!file ? (
            <div className="code-empty">
              <span className="big">🧾</span>
              <strong>왼쪽 파일 트리에서 파일을 선택하세요</strong>
              <span>선택한 파일의 코드를 여기에서 미리 볼 수 있습니다.</span>
            </div>
          ) : loading ? (
            <div className="code-empty">
              <span className="big">⏳</span>
              <strong>"{name}" 여는 중…</strong>
            </div>
          ) : !entry ? (
            <div className="code-empty">
              <span className="big">🗒</span>
              <strong>"{name}" 미리보기를 준비하지 못했습니다</strong>
              <span>{project?.readFile ? '이 파일을 읽지 못했거나 지원하지 않는 형식입니다.' : '이 데모에는 해당 파일의 내용이 포함되어 있지 않습니다.'}</span>
            </div>
          ) : type === 'image' ? (
            <div className="code-media">
              <img className="code-image" src={entry.url} alt={`${name} 미리보기`} />
            </div>
          ) : type === 'pdf' ? (
            <iframe className="code-pdf" src={entry.url} title={`${name} 미리보기`} />
          ) : type === 'binary' ? (
            <div className="code-empty">
              <span className="big">📦</span>
              <strong>"{name}" 은(는) 미리볼 수 없는 파일입니다</strong>
              <span>이미지·PDF·텍스트 형식만 미리보기를 지원합니다.</span>
            </div>
          ) : isMarkdown ? (
            <div className="md-reading">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.code}</ReactMarkdown>
            </div>
          ) : (
            <div className="code-scroll">
              <div className="code-gutter" aria-hidden="true">
                {lines.map((_, i) => (
                  <span className="code-lineno" key={i}>{i + 1}</span>
                ))}
              </div>
              <pre className="code-pre hljs">
                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
