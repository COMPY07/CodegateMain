export const dashboardPeriods = [
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
  { id: '90d', label: '90일' },
]

export const dashboardGoal = {
  id: 'goal-demo',
  title: 'Vibe Studio 데모 완성',
  description: '질문 모드부터 AI 검수까지 핵심 사용자 흐름을 연결합니다.',
  dueLabel: 'D-3',
  steps: [
    { id: 'goal-preview', label: '라이브 프리뷰와 질문 모드 연결', completed: true },
    { id: 'goal-agent', label: '에이전트 진행 상태 시각화', completed: true },
    { id: 'goal-dashboard', label: 'Goal·AI 사용 대시보드 구성', completed: false },
    { id: 'goal-review', label: '로컬 함수 검수 결과 연결', completed: false },
  ],
}

const aiUsage = ({ requests, totalTokens, inputTokens, outputTokens, cost, localShare, models }) => ({
  requests,
  totalTokens,
  inputTokens,
  outputTokens,
  estimatedCost: cost,
  localShare,
  models,
})

export const dashboardMockData = {
  '7d': {
    ai: aiUsage({
      requests: 34,
      totalTokens: 48600,
      inputTokens: 36200,
      outputTokens: 12400,
      cost: 1.84,
      localShare: 72,
      models: [
        { id: 'claude', name: 'Claude Sonnet', requests: 17, tokens: 27100, share: 56, tone: 'purple' },
        { id: 'gpt', name: 'GPT', requests: 9, tokens: 13900, share: 29, tone: 'blue' },
        { id: 'local', name: 'Local LLM', requests: 8, tokens: 7600, share: 15, tone: 'green' },
      ],
    }),
  },
  '30d': {
    ai: aiUsage({
      requests: 142,
      totalTokens: 218400,
      inputTokens: 164800,
      outputTokens: 53600,
      cost: 7.92,
      localShare: 80,
      models: [
        { id: 'claude', name: 'Claude Sonnet', requests: 76, tokens: 126700, share: 58, tone: 'purple' },
        { id: 'gpt', name: 'GPT', requests: 38, tokens: 56800, share: 26, tone: 'blue' },
        { id: 'local', name: 'Local LLM', requests: 28, tokens: 34900, share: 16, tone: 'green' },
      ],
    }),
  },
  '90d': {
    ai: aiUsage({
      requests: 418,
      totalTokens: 672900,
      inputTokens: 511300,
      outputTokens: 161600,
      cost: 23.48,
      localShare: 83,
      models: [
        { id: 'claude', name: 'Claude Sonnet', requests: 217, tokens: 383600, share: 57, tone: 'purple' },
        { id: 'gpt', name: 'GPT', requests: 109, tokens: 181700, share: 27, tone: 'blue' },
        { id: 'local', name: 'Local LLM', requests: 92, tokens: 107600, share: 16, tone: 'green' },
      ],
    }),
  },
}
