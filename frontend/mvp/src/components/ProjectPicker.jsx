import { useState } from 'react'

// 내 컴퓨터의 프로젝트를 고르고 새로 만든다. 목록을 읽지 못해도 목업을 채우지 않는다.

export default function ProjectPicker({ status, projects = [], root, active, select, create, open }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true); setError('')
    try {
      await create(trimmed)
      setName('')
      setCreating(false)
    } catch (err) {
      setError(err?.message || '프로젝트를 만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const openExisting = async () => {
    if (!open) return
    setBusy(true); setError('')
    try {
      await open()
    } catch (err) {
      setError(err?.message || '프로젝트 폴더를 열지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'unavailable') {
    return (
      <div className="proj-box">
        <div className="proj-label">프로젝트</div>
        <p className="cot-thought">
          내장 런타임을 시작하고 있습니다. 잠시 후 자동으로 다시 연결합니다.
        </p>
      </div>
    )
  }

  return (
    <div className="proj-box">
      <div className="proj-label">
        프로젝트
        {root ? <span className="proj-root" title={root}>{root}</span> : null}
      </div>

      {status === 'loading' && projects.length === 0 ? (
        <p className="cot-thought">불러오는 중…</p>
      ) : projects.length === 0 ? (
        <p className="cot-thought">아직 프로젝트가 없습니다. 새로 만들어 주세요.</p>
      ) : (
        <select
          className="proj-select"
          value={active || ''}
          onChange={(e) => select(e.target.value)}
          aria-label="프로젝트 선택"
        >
          {projects.map(p => (
            <option key={p.id || p.name} value={p.id || p.name} title={p.path}>
              {p.name}{p.opened ? ` — ${p.path}` : ''}{p.runnable ? '' : ' (실행 불가)'}
            </option>
          ))}
        </select>
      )}

      {error && !creating ? <div className="cot-thought" role="alert">⚠ {error}</div> : null}

      {creating ? (
        <form onSubmit={submit} className="proj-new">
          <input
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 프로젝트 이름"
            aria-label="새 프로젝트 이름"
            autoFocus
          />
          {error ? <div className="cot-thought" role="alert">⚠ {error}</div> : null}
          <div className="proj-new-actions">
            <button className="btn-primary" type="submit" disabled={!name.trim() || busy}>
              {busy ? '만드는 중…' : '만들기'}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => { setCreating(false); setError('') }}
            >
              취소
            </button>
          </div>
        </form>
      ) : (
        <div className="proj-actions">
          <button className="proj-open" type="button" onClick={openExisting} disabled={busy}>
            {busy ? '선택 대기 중…' : '폴더 열기'}
          </button>
          <button className="proj-add" type="button" onClick={() => setCreating(true)} disabled={busy}>
            ＋ 새로 만들기
          </button>
        </div>
      )}
    </div>
  )
}
