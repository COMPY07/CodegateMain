// 실제 파일 트리와 Live View에는 목업 데이터를 사용하지 않는다.

// 표시용 카탈로그일 뿐이며, 실제 사용 가능 여부는 내장 런타임이 결정한다.
export const models = [
  { id: 'claude', name: 'Claude', vendor: 'Anthropic', tile: '#D97757', registered: false },
  { id: 'gpt', name: 'GPT', vendor: 'OpenAI', tile: '#0f9d78', registered: false },
]
export const activeModelId = 'claude'

export const tabs = [
  { id: 'cot',   label: '에이전트 CoT', icon: '◐', pinned: false, dot: '#4f46e5' },
  { id: 'live',  label: '라이브 웹',    icon: '◧', pinned: true,  dot: '#16a34a' },
  { id: 'dash',  label: '대시보드',     icon: '▦', pinned: true,  dot: '#2563eb' },
  { id: 'pdf',   label: 'report.pdf',   icon: '📄', pinned: false, dot: '#e11d48' },
  { id: 'csv',   label: 'data.csv',     icon: '▤', pinned: false, dot: '#d97706' },
]

export const dashBars = [
  { x: '월', v: 42 }, { x: '화', v: 68 }, { x: '수', v: 55 },
  { x: '목', v: 81 }, { x: '금', v: 73 }, { x: '토', v: 38 }, { x: '일', v: 60 },
]

export const csvData = {
  cols: ['id', 'name', 'email', 'status'],
  rows: [
    ['1', 'Kim', 'kim@test.io', 'active'],
    ['2', 'Lee', 'lee@test.io', 'pending'],
    ['3', 'Park', 'park@test.io', 'active'],
    ['4', 'Choi', 'choi@test.io', 'blocked'],
  ],
}
