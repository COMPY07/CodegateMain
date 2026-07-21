import { useMemo, useRef, useState } from 'react'
import '../csv-viewer.css'

const sampleSheet = [['이름', '이메일', '상태'], ['김민준', 'minjun@example.com', '활성'], ['이서연', 'seoyeon@example.com', '대기']]

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }

  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row) }
  if (quoted) throw new Error('unterminated quoted field')
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '')
  const width = Math.max(0, ...rows.map(item => item.length))
  return rows.filter(item => item.some(value => value !== '')).map(item => [
    ...item,
    ...Array(Math.max(0, width - item.length)).fill(''),
  ])
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function compareCells(left, right) {
  const a = String(left ?? '').trim()
  const b = String(right ?? '').trim()
  const aNumber = Number(a)
  const bNumber = Number(b)
  if (a && b && Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber
  return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' })
}

export default function CsvViewer() {
  const inputRef = useRef(null)
  const resizeRef = useRef(null)
  const [matrix, setMatrix] = useState(sampleSheet)
  const [hasHeader, setHasHeader] = useState(true)
  const [fileName, setFileName] = useState('data.csv')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ column: -1, direction: 'asc' })
  const [widths, setWidths] = useState([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const columnCount = Math.max(0, ...matrix.map(row => row.length))
  const headers = hasHeader ? (matrix[0] || []) : Array.from({ length: columnCount }, (_, index) => `열 ${index + 1}`)
  const dataOffset = hasHeader ? 1 : 0
  const rows = matrix.slice(dataOffset)
  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko')
    return rows.map((cells, index) => ({ cells, sourceIndex: index + dataOffset }))
      .filter(({ cells }) => !normalized || cells.some(cell => String(cell).toLocaleLowerCase('ko').includes(normalized)))
  }, [dataOffset, query, rows])

  const loadFile = async file => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && !['text/csv', 'application/vnd.ms-excel'].includes(file.type)) {
      setError('CSV 파일만 열 수 있습니다.')
      return
    }
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.length === 0) throw new Error('empty')
      setMatrix(parsed); setFileName(file.name); setQuery(''); setSort({ column: -1, direction: 'asc' }); setWidths([]); setError('')
    } catch {
      setError('CSV 내용을 읽지 못했습니다. 파일 인코딩과 형식을 확인하세요.')
    }
  }

  const updateCell = (rowIndex, columnIndex, value) => {
    setMatrix(current => current.map((row, index) => {
      if (index !== rowIndex) return row
      const next = [...row]
      while (next.length <= columnIndex) next.push('')
      next[columnIndex] = value
      return next
    }))
  }

  const sortColumn = column => {
    const direction = sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc'
    setMatrix(current => {
      const head = hasHeader ? current.slice(0, 1) : []
      const body = current.slice(hasHeader ? 1 : 0).map((row, index) => ({ row, index }))
      body.sort((a, b) => compareCells(a.row[column], b.row[column]) * (direction === 'asc' ? 1 : -1) || a.index - b.index)
      return [...head, ...body.map(item => item.row)]
    })
    setSort({ column, direction })
  }

  const startResize = (event, column) => {
    event.preventDefault(); event.stopPropagation()
    resizeRef.current = { column, startX: event.clientX, startWidth: widths[column] || 150 }
    const onMove = moveEvent => {
      const resize = resizeRef.current
      if (!resize) return
      const width = Math.max(80, resize.startWidth + moveEvent.clientX - resize.startX)
      setWidths(current => { const next = [...current]; next[resize.column] = width; return next })
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const download = () => {
    const csv = matrix.map(row => row.map(escapeCsv).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${fileName.replace(/\.csv$/i, '') || 'data'}-edited.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const onDrop = event => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]) }

  return (
    <div className="vp-frame dark">
      <section className="csv-view" onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <input ref={inputRef} className="file-input-hidden" type="file" accept=".csv,text/csv" onChange={event => loadFile(event.target.files[0])} />
        <header className="csv-toolbar">
          <button className="csv-open" onClick={() => inputRef.current?.click()}>CSV 열기</button>
          <span className="csv-filename" title={fileName}>{fileName}</span>
          <span className="csv-local-badge">로컬 전용</span>
          <label className="csv-header-option"><input type="checkbox" checked={hasHeader} onChange={event => { setHasHeader(event.target.checked); setSort({ column: -1, direction: 'asc' }) }} />첫 행을 열 이름으로 사용</label>
          <span className="csv-spacer" />
          <label className="csv-search"><span>검색</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="모든 열에서 찾기" />{query && <button aria-label="검색어 지우기" onClick={() => setQuery('')}>×</button>}</label>
          <button className="csv-download" onClick={download}>CSV 다운로드</button>
        </header>
        {error && <div className="csv-error" role="alert">{error}</div>}
        <div className="csv-grid-wrap">
          <table className="csv-table">
            <colgroup><col style={{ width: 46 }} />{headers.map((_, index) => <col key={index} style={{ width: widths[index] || 150 }} />)}</colgroup>
            <thead><tr><th className="csv-row-number">#</th>{headers.map((header, column) => <th key={column}><button className="csv-sort" onClick={() => sortColumn(column)} title={`${header || `열 ${column + 1}`} 정렬`}><span>{header || `열 ${column + 1}`}</span><span className="csv-sort-icon">{sort.column === column ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button><span className="csv-resizer" onPointerDown={event => startResize(event, column)} /></th>)}</tr></thead>
            <tbody>{visibleRows.map(({ cells, sourceIndex }, visibleIndex) => <tr key={`${sourceIndex}-${visibleIndex}`}><th className="csv-row-number">{sourceIndex + (hasHeader ? 0 : 1)}</th>{headers.map((_, column) => <td key={column}><input value={cells[column] ?? ''} onChange={event => updateCell(sourceIndex, column, event.target.value)} aria-label={`${sourceIndex + 1}행 ${column + 1}열`} /></td>)}</tr>)}</tbody>
          </table>
          {visibleRows.length === 0 && <div className="csv-empty">검색 결과가 없습니다.</div>}
        </div>
        <footer className="csv-status">{visibleRows.length.toLocaleString()} / {rows.length.toLocaleString()}행 · {headers.length.toLocaleString()}열 · 셀을 클릭해 편집</footer>
        {dragging && <div className="csv-drop-overlay">여기에 CSV 파일을 놓으세요</div>}
      </section>
    </div>
  )
}
