// ===== 좌측 파일시스템 트리 =====
export const fileTree = [
  {
    name: 'my-app', type: 'folder', open: true, children: [
      { name: 'src', type: 'folder', open: true, children: [
        { name: 'App.jsx', type: 'file', icon: '⚛' },
        { name: 'AddressBar.tsx', type: 'file', icon: '⚛', active: true },
        { name: 'LoginForm.tsx', type: 'file', icon: '⚛' },
        { name: 'styles.css', type: 'file', icon: '🎨' },
      ]},
      { name: 'public', type: 'folder', open: false, children: [
        { name: 'index.html', type: 'file', icon: '🌐' },
      ]},
      { name: 'package.json', type: 'file', icon: '📦' },
      { name: 'README.md', type: 'file', icon: '📄' },
    ]
  },
]

// ===== 좌측 유틸리티 =====
export const utilities = [
  { icon: '🛡', title: '로컬 코드 검수', desc: '함수 단위 · 온디바이스', badge: 'ON' },
  { icon: '🔎', title: '취약점 스캔', desc: '변경 diff 기준' },
  { icon: '🧩', title: 'MCP 도구', desc: '3개 연결됨' },
  { icon: '📊', title: '토큰 사용량', desc: '이번 세션 12.4k' },
]

// ===== 상단 탭 =====
export const tabs = [
  { id: 'cot',   label: '에이전트 CoT', icon: '◐', pinned: false, dot: '#c084fc' },
  { id: 'live',  label: '라이브 웹',    icon: '◧', pinned: true,  dot: '#34d399' },
  { id: 'dash',  label: '대시보드',     icon: '▦', pinned: true,  dot: '#60a5fa' },
  { id: 'pdf',   label: 'report.pdf',   icon: '📄', pinned: false, dot: '#fb7185' },
  { id: 'csv',   label: 'data.csv',     icon: '▤', pinned: false, dot: '#fbbf24' },
]

// ===== 에이전트 CoT (사고 흐름) =====
export const cotSteps = [
  { state: 'done', head: '요청 분석', thought: 'URL 입력 필드를 더 크게 만들고 자동완성을 추가하라는 요청. 대상 컴포넌트는 AddressBar.tsx로 특정됨.', tool: null },
  { state: 'done', head: '파일 로컬 검수 수신', thought: '로컬 LLM이 보낸 함수 요약을 확인: validateUrl(빈 입력 예외 누락), handleSubmit(미검증 입력 사용 — 보안).', tool: 'read digest ← local-llm' },
  { state: 'done', head: '스타일 수정 계획', thought: 'url-bar의 height/font-size를 키우고, datalist 기반 자동완성을 추가. 기존 검증 로직은 보존.', tool: null },
  { state: 'active', head: '코드 편집 중', thought: 'AddressBar.tsx의 입력 필드에 자동완성 속성과 확대 스타일을 적용하는 중…', tool: 'edit AddressBar.tsx:42' },
  { state: 'pending', head: '검증 & Hot-reload', thought: '변경 후 로컬 검수 재실행 → 프리뷰 반영 예정.', tool: null },
]

// ===== 우측 대화 (질문/답변) =====
export const initialConversation = [
  { role: 'q', text: '로그인 페이지 만들어줘. 심플하게.' },
  { role: 'a', text: 'LoginForm.tsx를 생성했습니다. 이메일·비밀번호 입력과 로그인 버튼을 포함한 심플한 폼입니다. 라이브 웹 탭에서 확인하세요.' },
  { role: 'q', text: '맨 위에 주소 넣는 칸을 더 크게 해줘', chip: 'URL 입력 필드' },
  { role: 'a', text: '`AddressBar` 컴포넌트의 입력 필드 크기를 키우겠습니다. 로컬 검수에서 이 함수에 미검증 입력 사용(보안) 이슈가 있어 자동완성과 함께 검증도 보강할까요?' },
]

// ===== 대시보드 막대 데이터 =====
export const dashBars = [
  { x: '월', v: 42 }, { x: '화', v: 68 }, { x: '수', v: 55 },
  { x: '목', v: 81 }, { x: '금', v: 73 }, { x: '토', v: 38 }, { x: '일', v: 60 },
]

// ===== CSV 미리보기 =====
export const csvData = {
  cols: ['id', 'name', 'email', 'status'],
  rows: [
    ['1', 'Kim', 'kim@test.io', 'active'],
    ['2', 'Lee', 'lee@test.io', 'pending'],
    ['3', 'Park', 'park@test.io', 'active'],
    ['4', 'Choi', 'choi@test.io', 'blocked'],
  ],
}

// ===== 라이브 웹 프리뷰용 샘플 페이지 (iframe srcDoc) =====
// 주입된 스크립트가 질문모드일 때 hover/click 을 부모로 postMessage 한다.
export const samplePageHTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;}
  body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;background:linear-gradient(180deg,#faf9ff,#f2effb);color:#2a2340;}
  header{display:flex;align-items:center;gap:14px;padding:14px 28px;background:#fff;border-bottom:1px solid #eee;}
  .logo{font-weight:800;color:#7c3aed;font-size:18px;}
  nav{display:flex;gap:20px;margin-left:20px;font-size:14px;color:#5b5375;}
  .addr{margin-left:auto;display:flex;gap:8px;align-items:center;}
  .url{width:280px;height:34px;border:1px solid #d8d3e6;border-radius:9px;padding:0 12px;font-size:13px;}
  .go{height:34px;padding:0 16px;border-radius:9px;border:none;background:#7c3aed;color:#fff;font-weight:700;}
  main{padding:44px 48px;}
  h1{font-size:30px;margin-bottom:8px;color:#1a1530;}
  .sub{color:#6b6485;margin-bottom:26px;}
  .hero{height:150px;border-radius:14px;background:linear-gradient(120deg,#ede9fe,#ddd6fe);display:flex;align-items:center;justify-content:center;color:#7c3aed;font-weight:800;font-size:18px;margin-bottom:26px;}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:26px;}
  .c{background:#fff;border:1px solid #eee;border-radius:12px;padding:18px;}
  .c h3{font-size:15px;margin-bottom:6px;}.c p{font-size:13px;color:#6b6485;}
  .row{display:flex;gap:12px;}
  .btnp{background:#7c3aed;color:#fff;padding:11px 22px;border-radius:9px;font-weight:700;border:none;font-size:14px;}
  .btns{background:#ece8f8;color:#5b4b8a;padding:11px 22px;border-radius:9px;font-weight:700;border:none;font-size:14px;}
</style></head><body>
  <header>
    <span class="logo" data-label="로고">◆ MyApp</span>
    <nav data-label="네비게이션 바"><a data-label="'홈' 메뉴">홈</a><a data-label="'요금' 메뉴">요금</a><a data-label="'문서' 메뉴">문서</a></nav>
    <div class="addr">
      <input class="url" placeholder="https://" data-label="URL 입력 필드"/>
      <button class="go" data-label="이동 버튼">이동</button>
    </div>
  </header>
  <main>
    <h1 data-label="페이지 제목">내 서비스에 오신 걸 환영합니다</h1>
    <p class="sub" data-label="부제목">지금 바로 시작해보세요.</p>
    <div class="hero" data-label="히어로 배너">히어로 배너</div>
    <div class="cards">
      <div class="c" data-label="기능 카드 1"><h3>빠른 개발</h3><p>말로 설명하면 코드가 됩니다.</p></div>
      <div class="c" data-label="기능 카드 2"><h3>자동 검수</h3><p>보안·누락을 미리 잡습니다.</p></div>
      <div class="c" data-label="기능 카드 3"><h3>토큰 절약</h3><p>로컬 검수로 비용을 아낍니다.</p></div>
    </div>
    <div class="row">
      <button class="btnp" data-label="'시작하기' 버튼">시작하기</button>
      <button class="btns" data-label="'더 알아보기' 버튼">더 알아보기</button>
    </div>
  </main>
<script>
(function(){
  var picking=false, hl=null, lbl=null;
  function ensure(){
    if(!hl){
      hl=document.createElement('div');
      hl.style.cssText='position:fixed;pointer-events:none;z-index:99998;border:2px solid #7c3aed;border-radius:6px;background:rgba(124,58,237,.12);transition:all .04s;display:none;';
      document.body.appendChild(hl);
      lbl=document.createElement('div');
      lbl.style.cssText='position:fixed;pointer-events:none;z-index:99999;background:#7c3aed;color:#fff;font:700 12px -apple-system,sans-serif;padding:3px 9px;border-radius:6px;white-space:nowrap;display:none;box-shadow:0 4px 12px rgba(124,58,237,.5);';
      document.body.appendChild(lbl);
    }
  }
  function labelFor(el){
    if(!el||el===document.body||el===document.documentElement) return null;
    var dl=el.getAttribute&&el.getAttribute('data-label'); if(dl) return dl;
    var tag=el.tagName.toLowerCase();
    var ph=el.getAttribute&&el.getAttribute('placeholder');
    if(tag==='input'){ if(ph) return ph+' 입력 필드'; return '입력 필드'; }
    if(tag==='button') return (el.textContent.trim()||'버튼')+' 버튼';
    if(tag==='a') return (el.textContent.trim()||'링크')+' 링크';
    if(tag==='nav') return '네비게이션 바';
    if(tag==='header') return '상단 헤더';
    if(/^h[1-3]$/.test(tag)) return '제목: '+el.textContent.trim().slice(0,16);
    var t=el.textContent.trim(); if(t&&t.length<20) return t;
    return tag+' 영역';
  }
  function pathFor(el){
    var parts=[];
    while(el&&el.nodeType===1&&el!==document.body&&parts.length<5){
      var s=el.tagName.toLowerCase();
      if(el.className&&typeof el.className==='string'){var c=el.className.trim().split(/\\s+/)[0];if(c)s+='.'+c;}
      parts.unshift(s); el=el.parentElement;
    }
    return parts.join(' > ');
  }
  function move(e){
    if(!picking) return; ensure();
    var el=e.target; var lab=labelFor(el);
    if(!lab){ hl.style.display='none'; lbl.style.display='none'; return; }
    var r=el.getBoundingClientRect();
    hl.style.display='block'; hl.style.left=r.left+'px'; hl.style.top=r.top+'px'; hl.style.width=r.width+'px'; hl.style.height=r.height+'px';
    lbl.style.display='block'; lbl.textContent='📍 '+lab;
    var ly=r.top-26; if(ly<2) ly=r.bottom+6;
    lbl.style.left=r.left+'px'; lbl.style.top=ly+'px';
  }
  function click(e){
    if(!picking) return;
    e.preventDefault(); e.stopPropagation();
    var el=e.target; var lab=labelFor(el); if(!lab) return;
    parent.postMessage({source:'vibe-preview',type:'pick',label:lab,selector:pathFor(el)},'*');
    hl.style.transform='scale(1.04)'; setTimeout(function(){if(hl)hl.style.transform='';},120);
  }
  window.addEventListener('mousemove',move,true);
  window.addEventListener('click',click,true);
  window.addEventListener('message',function(e){
    var d=e.data||{}; if(d.type==='qmode'){ picking=!!d.on; ensure();
      if(!picking){ hl.style.display='none'; lbl.style.display='none'; }
      document.body.style.cursor=picking?'crosshair':'';
    }
  });
})();
<\/script>
</body></html>`
