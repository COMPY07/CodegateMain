import { useCallback, useEffect, useState } from 'react'

import { getPreview, startProjectPreview, stopProjectPreview } from '../api/localRuntime.js'

/**
 * 선택한 프로젝트의 dev server. 앱의 내장 런타임이 프로젝트 폴더에서
 * `npm run dev`를 실행하고 실제 hot-reload 주소를 돌려준다.
 *
 * status: 'idle' | 'loading' | 'running' | 'error'
 */
export function useDevServer(project) {
  const [state, setState] = useState({ status: 'idle', url: null, logs: [], error: null })

  const apply = useCallback((data) => {
    setState({
      status: data.running ? 'running' : 'idle',
      url: data.running ? data.url : null,
      logs: data.logs || [],
      error: null,
    })
  }, [])

  // 선택한 프로젝트는 곧바로 실제 dev server 로 올린다. 이미 같은 프로젝트의
  // 서버가 떠 있으면 이어받고, 다른 프로젝트라면 내장 런타임이 안전하게 교체한다.
  useEffect(() => {
    let alive = true
    if (!project) {
      setState({ status: 'idle', url: null, logs: [], error: null })
      return () => { alive = false }
    }
    if (!project.runnable) {
      setState({ status: 'idle', url: null, logs: [], error: null })
      return () => { alive = false }
    }

    setState({ status: 'loading', url: null, logs: [], error: null })
    getPreview()
      .then((current) => {
        if (!alive) return null
        if (current.running && current.projectPath === project.path) return current
        return startProjectPreview(project.id || project.name)
      })
      .then((data) => { if (alive && data) apply(data) })
      .catch((err) => {
        if (!alive) return
        setState({
          status: 'error',
          url: null,
          logs: [],
          error: err?.message || 'dev server 를 시작하지 못했습니다.',
        })
      })
    return () => { alive = false }
  }, [apply, project?.id, project?.name, project?.path, project?.runnable])

  const start = useCallback(async () => {
    setState(s => ({ ...s, status: 'loading', error: null }))
    try {
      if (!project) throw new Error('먼저 프로젝트 폴더를 선택해 주세요.')
      if (!project.runnable) throw new Error('package.json 과 dev 스크립트가 있는 프로젝트가 필요합니다.')
      apply(await startProjectPreview(project.id || project.name))
    } catch (err) {
      const message = err?.message || 'dev server 를 시작하지 못했습니다.'
      setState({ status: 'error', url: null, logs: [], error: message })
      throw err
    }
  }, [apply, project])

  const stop = useCallback(async () => {
    try {
      apply(await stopProjectPreview())
    } catch (err) {
      setState(s => ({ ...s, error: err?.message || 'dev server 를 멈추지 못했습니다.' }))
    }
  }, [apply])

  return { preview: state, startPreview: start, stopPreview: stop }
}
