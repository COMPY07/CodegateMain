import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CodeViewer from '../components/CodeViewer.jsx'

describe('CodeViewer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('선택한 실제 프로젝트 파일을 로컬 런타임에서 읽는다', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      type: 'text',
      name: 'App.jsx',
      language: 'jsx',
      code: 'export default function App() { return <main>Hello</main> }\n',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <CodeViewer
        project="opened:project-id"
        file={{ name: 'App.jsx', path: 'shop/src/App.jsx', icon: '⚛' }}
      />,
    )

    await waitFor(() => expect(screen.getByText('읽기 전용 · 로컬')).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.code-pre code')).toHaveTextContent('Hello'))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/local/fs/file?project=opened%3Aproject-id&path=shop%2Fsrc%2FApp.jsx'),
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
