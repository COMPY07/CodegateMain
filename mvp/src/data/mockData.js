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
]

// ===== 모델 (사용량 · 등록 여부) =====
// registered:false 면 UI에서 "등록 안됨"으로 표시된다.
export const models = [
  { id: 'claude', name: 'Claude', vendor: 'Anthropic',  tile: '#D97757', registered: true,  usage: 32, tokens: '12.4k' },
  { id: 'gpt',    name: 'GPT',    vendor: 'OpenAI',      tile: '#0f9d78', registered: true,  usage: 58, tokens: '22.1k' },
  { id: 'gemini', name: 'Gemini', vendor: 'Google',      tile: 'linear-gradient(145deg,#4d8bf0,#9a72e6)', registered: false },
  { id: 'grok',   name: 'Grok',   vendor: 'xAI',         tile: '#17171b', bordered: true, registered: false },
  { id: 'kimi',   name: 'Kimi',   vendor: 'Moonshot AI', tile: '#2a2e55', bordered: true, registered: true,  usage: 11, tokens: '4.2k' },
  { id: 'mimo',   name: 'MiMo',   vendor: 'Xiaomi',      tile: '#ff6a00', registered: false },
]
export const activeModelId = 'claude'

// ===== 상단 탭 =====
export const tabs = [
  { id: 'cot',   label: '에이전트 CoT', icon: '◐', pinned: false, dot: '#c084fc' },
  { id: 'live',  label: '라이브 웹',    icon: '◧', pinned: true,  dot: '#34d399' },
  { id: 'dash',  label: '대시보드',     icon: '▦', pinned: true,  dot: '#60a5fa' },
  { id: 'pdf',   label: 'report.pdf',   icon: '📄', pinned: false, dot: '#fb7185' },
  { id: 'csv',   label: 'data.csv',     icon: '▤', pinned: false, dot: '#fbbf24' },
]

// ===== 멀티 에이전트 작업 현황 (메인 + 서브에이전트) =====
export const agentRun = {
  title: '로그인 페이지 리팩터링 + 폼 검증 추가',
  runId: 142,
  main: {
    name: '오케스트레이터',
    role: 'Main Agent',
    status: 'running',
    steps: [
      { state: 'done', head: '요청 분석', thought: '로그인 페이지를 심플하게 만들고 폼 검증을 추가하라는 요청. 대상 파일과 범위를 특정.', tool: null },
      { state: 'done', head: '작업 분해 · 서브에이전트 3개 배정', thought: 'UI 빌더 · 폼 검증기 · 테스트 작성으로 병렬 분배. 검수기는 후속(선행 완료 후) 실행.', tool: 'spawn ×3' },
      { state: 'active', head: '서브에이전트 조율 & 로컬 검수 수신', thought: '진행 상황을 취합하고 로컬 LLM 함수 요약을 각 서브에이전트에 전달하는 중.', tool: 'read digest ← local-llm' },
      { state: 'pending', head: '결과 통합 → 검수 → Hot-reload', thought: '서브에이전트 완료 시 검수기 실행 후 프리뷰 반영 예정.', tool: null },
    ],
  },
  subs: [
    {
      id: 'ui', name: 'UI 빌더', role: 'UI Builder', status: 'done', order: 1, progress: 100,
      elapsed: '41s', files: ['LoginForm.tsx'], current: 'LoginForm.tsx 생성 완료',
      steps: [
        { state: 'done', head: '컴포넌트 계획', thought: '이메일·비밀번호 입력 + 로그인 버튼 구조 확정.' },
        { state: 'done', head: 'JSX 작성', thought: '접근성 라벨 포함해 폼 마크업 작성.' },
        { state: 'done', head: '스타일 적용', thought: '심플한 카드형 레이아웃으로 스타일링.' },
      ],
    },
    {
      id: 'val', name: '폼 검증기', role: 'Validator', status: 'running', order: 2, progress: 62,
      elapsed: '0:23', files: ['validation.ts'], current: '비밀번호 규칙 작성 중 (3/5 필드)',
      steps: [
        { state: 'done', head: '검증 규칙 설계', thought: '필수·형식·길이 규칙 정의.' },
        { state: 'done', head: '이메일 검증', thought: '정규식 기반 이메일 유효성 구현.' },
        { state: 'active', head: '비밀번호 검증', thought: '최소 길이·문자 조합 규칙을 작성하는 중…', tool: 'edit validation.ts' },
        { state: 'pending', head: '에러 메시지 연결', thought: '필드별 에러 표시 연결 예정.' },
      ],
    },
    {
      id: 'test', name: '테스트 작성', role: 'Test Writer', status: 'running', order: 2, progress: 38,
      elapsed: '0:18', files: ['login.test.ts'], current: '로그인 성공 케이스 작성 중',
      steps: [
        { state: 'done', head: '케이스 도출', thought: '성공·실패·엣지 케이스 목록화.' },
        { state: 'active', head: '성공 케이스', thought: '정상 로그인 플로우 테스트 작성 중…', tool: 'edit login.test.ts' },
        { state: 'pending', head: '실패 케이스', thought: '잘못된 자격증명 테스트 예정.' },
      ],
    },
    {
      id: 'review', name: '검수기', role: 'Reviewer', status: 'queued', order: 3, progress: 0,
      elapsed: '—', files: [], dependsOn: '폼 검증기 · 테스트 작성', current: '선행 작업 완료 대기 중',
      steps: [
        { state: 'pending', head: '변경 diff 검수', thought: '보안·누락·중복을 함수 단위로 점검 예정.' },
      ],
    },
  ],
}

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
