import React from 'react'

export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Vibe Studio render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-error" role="alert">
        <div className="fatal-card">
          <span className="fatal-icon">!</span>
          <h1>화면을 표시하지 못했습니다.</h1>
          <p>예상하지 못한 오류가 발생했습니다. 앱을 다시 불러오면 임시 화면 상태가 초기화될 수 있습니다.</p>
          <button onClick={() => window.location.reload()}>앱 다시 불러오기</button>
        </div>
      </main>
    )
  }
}
