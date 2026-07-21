export const dashboardPeriods = [
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
  { id: '90d', label: '90일' },
]

const stat = (runs, saving, security, period) => [
  { id: 'runs', value: String(runs), label: '실행한 작업', tone: 'purple', help: `최근 ${period} 동안 시작한 에이전트 작업 수` },
  { id: 'tokens', value: `${saving}%`, label: '토큰 절감(로컬 검수)', tone: 'green', help: '로컬 검수로 외부 모델 전송을 줄인 비율' },
  { id: 'security', value: String(security), label: '예방한 보안 이슈', tone: 'amber', help: '실행 전에 탐지해 차단한 보안 문제 수' },
]

export const dashboardMockData = {
  '7d': {
    stats: stat(34, 76, 3, '7일'),
    activity: [
      { x: '월', value: 42, detail: '월요일 · 작업 42건' }, { x: '화', value: 68, detail: '화요일 · 작업 68건' },
      { x: '수', value: 55, detail: '수요일 · 작업 55건' }, { x: '목', value: 81, detail: '목요일 · 작업 81건' },
      { x: '금', value: 73, detail: '금요일 · 작업 73건' }, { x: '토', value: 38, detail: '토요일 · 작업 38건' },
      { x: '일', value: 60, detail: '일요일 · 작업 60건' },
    ],
  },
  '30d': {
    stats: stat(142, 80, 7, '30일'),
    activity: [
      { x: '1주', value: 186, detail: '1주차 · 작업 186건' }, { x: '2주', value: 244, detail: '2주차 · 작업 244건' },
      { x: '3주', value: 219, detail: '3주차 · 작업 219건' }, { x: '4주', value: 271, detail: '4주차 · 작업 271건' },
      { x: '이번 주', value: 128, detail: '이번 주 · 작업 128건' },
    ],
  },
  '90d': {
    stats: stat(418, 83, 21, '90일'),
    activity: [
      { x: '5월 전반', value: 422, detail: '5월 전반 · 작업 422건' }, { x: '5월 후반', value: 501, detail: '5월 후반 · 작업 501건' },
      { x: '6월 전반', value: 468, detail: '6월 전반 · 작업 468건' }, { x: '6월 후반', value: 557, detail: '6월 후반 · 작업 557건' },
      { x: '7월 전반', value: 530, detail: '7월 전반 · 작업 530건' }, { x: '7월 후반', value: 291, detail: '7월 후반 · 작업 291건' },
    ],
  },
}
