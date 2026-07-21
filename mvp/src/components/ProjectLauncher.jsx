import { useEffect, useRef, useState } from 'react'
import { isSupported, openDirectory, createProject, listRecent, reopenProject, removeRecent } from '../lib/projectSource.js'
import '../project-launcher.css'

// 포토샵 시작 화면처럼 프로젝트를 고르는 진입 화면.
// 실제 로컬 폴더는 File System Access API 로 연다(백엔드 불필요).
// 지원하지 않는 브라우저에서는 안내만 표시한다.

const KIND_LABEL = {
  react: 'React', node: 'Node.js', java: 'Java',
  python: 'Python', rust: 'Rust', go: 'Go', unknown: '프로젝트',
}

const relativeTime = (ts) => {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.round(hr / 24)
  return `${day}일 전`
}

export default function ProjectLauncher({ onOpen }) {
  const supported = isSupported()
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const nameInputRef = useRef(null)

  useEffect(() => {
    let alive = true
    listRecent().then(list => { if (alive) setRecent(list) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (creating) nameInputRef.current?.focus()
  }, [creating])

  const handleOpen = async () => {
    setError('')
    setLoading(true)
    try {
      const project = await openDirectory()
      if (project) onOpen(project)     // null 이면 사용자가 취소한 것
      else setRecent(await listRecent())
    } catch (err) {
      setError(err?.message || '폴더를 여는 중 문제가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const project = await createProject(newName)
      if (project) onOpen(project)       // null 이면 사용자가 위치 선택을 취소한 것
    } catch (err) {
      setError(err?.message || '프로젝트를 만드는 중 문제가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleReopen = async (id) => {
    setError('')
    setLoading(true)
    try {
      onOpen(await reopenProject(id))
    } catch (err) {
      setError(err?.message || '프로젝트를 다시 여는 중 문제가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (event, id) => {
    event.stopPropagation()
    await removeRecent(id)
    setRecent(await listRecent())
  }

  return (
    <div className="launcher">
      <div className="launcher-inner">
        <header className="launcher-head">
          <div className="launcher-brand">
            <div className="launcher-badge">V</div>
            <div>
              <h1 className="launcher-title">Vibe Studio</h1>
              <p className="launcher-sub">열 프로젝트를 선택하세요</p>
            </div>
          </div>
        </header>

        {!supported && (
          <div className="launcher-warning" role="alert">
            이 브라우저는 로컬 폴더 열기를 지원하지 않습니다. <strong>Chrome</strong> 또는 <strong>Edge</strong>에서 열어 주세요.
          </div>
        )}

        {error && <div className="launcher-error" role="alert">{error}</div>}

        <div className="launcher-actions">
          <button className="launcher-open" onClick={handleOpen} disabled={!supported || loading}>
            <span className="lo-icon">📂</span>
            <span className="lo-text">
              <strong>{loading ? '여는 중…' : '폴더 열기'}</strong>
              <span>내 컴퓨터의 프로젝트 폴더를 선택합니다</span>
            </span>
          </button>
          <button
            className={'launcher-open' + (creating ? ' active' : '')}
            onClick={() => setCreating(c => !c)}
            disabled={!supported || loading}
            aria-expanded={creating}
          >
            <span className="lo-icon">✨</span>
            <span className="lo-text">
              <strong>새 프로젝트 만들기</strong>
              <span>이름을 정하고 만들 위치를 선택합니다</span>
            </span>
          </button>
        </div>

        {creating && (
          <form className="launcher-newform" onSubmit={handleCreate}>
            <label className="nf-label" htmlFor="new-project-name">프로젝트 이름</label>
            <div className="nf-row">
              <input
                id="new-project-name"
                ref={nameInputRef}
                className="nf-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="예: my-app"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="nf-submit" type="submit" disabled={loading || !newName.trim()}>
                {loading ? '만드는 중…' : '위치 선택 후 생성'}
              </button>
            </div>
            <p className="nf-hint">선택한 상위 폴더 안에 이 이름으로 새 폴더가 생성됩니다. 절대 경로는 브라우저 보안상 다이얼로그로만 지정할 수 있습니다.</p>
          </form>
        )}

        <div className="launcher-recent">
          <div className="lr-label">최근 프로젝트</div>
          {recent.length === 0 ? (
            <div className="lr-empty">
              <span className="big">🗂</span>
              <strong>아직 연 프로젝트가 없습니다</strong>
              <span>위의 "폴더 열기"로 첫 프로젝트를 선택하세요.</span>
            </div>
          ) : (
            <div className="lr-grid">
              {recent.map(p => (
                <button
                  key={p.id}
                  className="lr-card"
                  onClick={() => handleReopen(p.id)}
                  disabled={loading}
                  title={`${p.name} · ${KIND_LABEL[p.kind] || '프로젝트'}`}
                >
                  <span className="lr-card-icon">📁</span>
                  <span className="lr-card-name">{p.name}</span>
                  <span className="lr-card-meta">{KIND_LABEL[p.kind] || '프로젝트'} · {relativeTime(p.lastOpenedAt)}</span>
                  <span
                    className="lr-card-remove"
                    role="button"
                    aria-label={`${p.name} 최근 목록에서 제거`}
                    onClick={(event) => handleRemove(event, p.id)}
                  >✕</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="launcher-note">
          파일은 서버로 전송되지 않고 이 브라우저에서만 열립니다.
        </p>
      </div>
    </div>
  )
}
