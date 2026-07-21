import { useCallback, useEffect, useState } from 'react'

import {
  createProject,
  getActiveProject,
  listProjects,
  openProjectFolder,
  setActiveProject,
} from '../api/localRuntime.js'

/**
 * 내 컴퓨터의 프로젝트 목록과 현재 선택. 앱의 내장 런타임에서만 읽으며
 * 실패했을 때 목업 프로젝트로 대신 채우지 않는다.
 *
 * status: 'idle' | 'loading' | 'ready' | 'unavailable'
 */
export default function useProjects({ enabled = true } = {}) {
  const [state, setState] = useState({ status: 'idle', projects: [], root: '', error: null })
  const [active, setActive] = useState(() => getActiveProject())

  const refresh = useCallback(async () => {
    if (!enabled) return
    setState(s => (s.status === 'ready' ? s : { ...s, status: 'loading' }))
    try {
      const data = await listProjects()
      // 관리 루트가 저장소 자체인 개발 환경에서는 agent/backend 같은 내부 폴더가
      // 함께 보일 수 있다. 실행 가능한 웹 프로젝트와 사용자가 직접 연 폴더만 노출한다.
      const projects = (data.projects || []).filter(project => project.runnable || project.opened)
      setState({
        status: 'ready',
        projects,
        root: data.root || '',
        error: null,
      })
      return projects
    } catch (e) {
      // 런타임 준비가 끝나지 않았으면 빈 목록을 그대로 보여준다.
      setState({ status: 'unavailable', projects: [], root: '', error: e.message })
      return null
    }
  }, [enabled])

  useEffect(() => {
    let cancelled = false
    let timer
    const connect = async () => {
      const result = await refresh()
      if (result === null && !cancelled) timer = window.setTimeout(connect, 1000)
    }
    connect()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [refresh])

  // 선택한 프로젝트가 사라졌으면(삭제·이름변경) 첫 항목으로 되돌린다.
  useEffect(() => {
    if (state.status !== 'ready') return
    const ids = state.projects.map(p => p.id || p.name)
    if (active && ids.includes(active)) return
    const next = ids[0] || ''
    setActive(next)
    setActiveProject(next)
  }, [state.status, state.projects, active])

  const select = useCallback((name) => {
    setActive(name)
    setActiveProject(name)
  }, [])

  const create = useCallback(async (name, template) => {
    const created = await createProject(name, template)
    await refresh()
    select(created.id || created.name)
    return created
  }, [refresh, select])

  const open = useCallback(async () => {
    const opened = await openProjectFolder()
    if (opened?.cancelled) return opened
    await refresh()
    select(opened.id || opened.name)
    return opened
  }, [refresh, select])

  return {
    status: state.status,
    projects: state.projects,
    root: state.root,
    error: state.error,
    active,
    activeProject: state.projects.find(p => (p.id || p.name) === active) || null,
    select,
    create,
    open,
    refresh,
  }
}
