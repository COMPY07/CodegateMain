export default function App() {
  return (
    <div className="app">
      <header>
        <span className="logo">◆ MyApp</span>
        <nav>
          <a href="#home">홈</a>
          <a href="#pricing">요금</a>
          <a href="#docs">문서</a>
        </nav>
      </header>

      <main>
        <h1>내 서비스에 오신 걸 환영합니다</h1>
        <p className="sub">지금 바로 시작해보세요.</p>
        <div className="hero">라이브 프리뷰 연결됨</div>
        <div className="row">
          <button className="btn-primary">뒤로가기</button>
          <button className="btn-secondary">더 알아보기</button>
        </div>
      </main>
    </div>
  )
}
