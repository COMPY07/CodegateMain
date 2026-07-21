import { useCallback, useEffect, useState } from 'react'

import { getProjectTree } from '../api/localRuntime.js'

/**
 * 선택한 프로젝트의 실제 파일 트리. 앱의 내장 런타임에서 읽는다.
 *
 * 목업 폴백은 없다. 없는 파일을 있는 것처럼 보여주면, 사용자가 그걸 클릭해
 * 존재하지 않는 파일을 고쳐달라고 요청하게 된다.
 *
 * status: 'idle'(선택된 프로젝트 없음) | 'loading' | 'ready' | 'unavailable'
 */
export function useFileTree(project) {
  const [state, setState] = useState({ status: 'idle', tree: [], error: null })

  const refresh = useCallback(async () => {
    if (!project) {
      setState({ status: 'idle', tree: [], error: null })
      return
    }
    setState(s => (s.status === 'ready' ? s : { ...s, status: 'loading' }))
    try {
      const list = await getProjectTree(project)
      setState({ status: 'ready', tree: Array.isArray(list) ? list : [], error: null })
    } catch (e) {
      setState({ status: 'unavailable', tree: [], error: e.message })
    }
  }, [project])

  useEffect(() => { refresh() }, [refresh])

  return { tree: state.tree, status: state.status, error: state.error, refresh }
}

export default useFileTree
