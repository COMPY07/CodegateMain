// Vibe Studio의 내장 로컬 런타임 API.
//
// 브라우저는 같은 origin의 /local 경로만 호출한다. 개발 서버/데스크톱 셸이
// 프로젝트 파일, dev server, Claude Code와 Codex를 담당하는 내부 런타임으로
// 요청을 전달하므로 사용자가 별도 포트나 토큰을 페어링할 필요가 없다.

const request = async (path, { signal, method = 'GET', body } = {}) => {
  const response = await fetch(path, {
    method,
    signal,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

async function errorMessage(response) {
  try {
    const body = await response.json()
    return body?.message || body?.error || `로컬 런타임 응답 오류 (${response.status})`
  } catch {
    return `로컬 런타임 응답 오류 (${response.status})`
  }
}

export const pingRuntime = ({ signal } = {}) => request('/local/ping', { signal })
export const getLocalRuntimeStatus = ({ signal } = {}) =>
  request('/local/agent/status', { signal })

export const listProjects = ({ signal } = {}) => request('/local/projects', { signal })
export const createProject = (name, template = 'react') =>
  request('/local/projects', { method: 'POST', body: { name, template } })
export const openProjectFolder = () =>
  request('/local/projects/open', { method: 'POST', body: {} })
export const getProjectTree = (project, { signal } = {}) =>
  request(`/local/fs/tree?project=${encodeURIComponent(project || '')}`, { signal })
export const getPreview = ({ signal } = {}) =>
  request('/local/preview/status', { signal })
export const startProjectPreview = (project) =>
  request('/local/preview/start', { method: 'POST', body: { project } })
export const stopProjectPreview = () =>
  request('/local/preview/stop', { method: 'POST', body: {} })

const PROJECT_KEY = 'vibe:project'

export function getActiveProject() {
  try { return localStorage.getItem(PROJECT_KEY) || '' } catch { return '' }
}

export function setActiveProject(name) {
  try {
    if (name) localStorage.setItem(PROJECT_KEY, name)
    else localStorage.removeItem(PROJECT_KEY)
  } catch { /* 저장 불가 환경은 현재 세션 상태만 사용한다. */ }
}
