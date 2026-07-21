import { useCallback, useEffect, useState } from 'react'

import { models as catalog } from '../data/mockData.js'
import { getLocalRuntimeStatus } from '../api/localRuntime.js'

// Claude/GPT의 실행 가능 여부는 중앙 서버의 API 키가 아니라 이 컴퓨터의
// Claude Code/Codex 설치·로그인 상태로 결정된다.
export function useModels() {
  const [models, setModels] = useState(catalog)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const local = await getLocalRuntimeStatus()
      const details = local.modelDetails || {}
      setModels(catalog.map((model) => ({
        ...model,
        registered: Boolean(local.models?.[model.id]),
        connection: details[model.id] || null,
      })))
      setStatus('ready')
      setError(null)
      return local
    } catch (err) {
      setModels(catalog)
      setStatus('unavailable')
      setError(err?.message || '내장 런타임 상태를 확인하지 못했습니다.')
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer
    const connect = async () => {
      const result = await refresh()
      if (!result && !cancelled) timer = window.setTimeout(connect, 1000)
    }
    connect()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [refresh])

  return { models, status, error, refresh }
}
