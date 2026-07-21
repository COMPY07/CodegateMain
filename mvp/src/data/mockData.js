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

// ===== 파일 트리 목업 코드 내용 =====
// 실제 디스크가 아니라 데모용 정적 내용이다. 키는 트리에서 '/'로 이은 파일 경로.
export const fileContents = {
  'my-app/src/App.jsx': {
    language: 'jsx',
    code: `import { useState } from 'react'
import AddressBar from './AddressBar'
import LoginForm from './LoginForm'
import './styles.css'

export default function App() {
  const [url, setUrl] = useState('')

  return (
    <div className="app">
      <AddressBar value={url} onChange={setUrl} />
      <main>
        <LoginForm />
      </main>
    </div>
  )
}
`,
  },
  'my-app/src/AddressBar.tsx': {
    language: 'tsx',
    code: `import { ChangeEvent } from 'react'

interface AddressBarProps {
  value: string
  onChange: (next: string) => void
}

export default function AddressBar({ value, onChange }: AddressBarProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value)
  }

  return (
    <header className="addr-bar">
      <input
        className="url"
        placeholder="https://"
        value={value}
        onChange={handleChange}
        aria-label="주소 입력"
      />
      <button className="go">이동</button>
    </header>
  )
}
`,
  },
  'my-app/src/LoginForm.tsx': {
    language: 'tsx',
    code: `import { FormEvent, useState } from 'react'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    // TODO: 폼 검증 및 로그인 요청 연결
  }

  return (
    <form className="login" onSubmit={handleSubmit}>
      <label>
        이메일
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <label>
        비밀번호
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      <button type="submit">로그인</button>
    </form>
  )
}
`,
  },
  'my-app/src/styles.css': {
    language: 'css',
    code: `.app {
  font-family: -apple-system, "Apple SD Gothic Neo", sans-serif;
  color: #2a2340;
}

.addr-bar {
  display: flex;
  gap: 8px;
  padding: 14px 28px;
}

.url {
  width: 280px;
  height: 34px;
  border: 1px solid #d8d3e6;
  border-radius: 9px;
  padding: 0 12px;
}

.login {
  display: grid;
  gap: 12px;
  max-width: 320px;
}
`,
  },
  'my-app/public/index.html': {
    language: 'html',
    code: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
  },
  'my-app/package.json': {
    language: 'json',
    code: `{
  "name": "my-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
`,
  },
  'my-app/README.md': {
    language: 'markdown',
    code: `# My App

Vibe Studio로 생성한 데모 프로젝트입니다.

## 실행

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
  },
}

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
  { id: 'cot',   label: '에이전트 CoT', icon: '◐', pinned: false, dot: '#4f46e5' },
  { id: 'live',  label: '라이브 웹',    icon: '◧', pinned: true,  dot: '#16a34a' },
  { id: 'dash',  label: '대시보드',     icon: '▦', pinned: true,  dot: '#2563eb' },
  { id: 'pdf',   label: 'report.pdf',   icon: '📄', pinned: false, dot: '#e11d48' },
  { id: 'csv',   label: 'data.csv',     icon: '▤', pinned: false, dot: '#d97706' },
]

// ===== 멀티 에이전트 작업 현황 (메인 + 서브에이전트) =====
export const agentRun = {
  title: '로그인 페이지 리팩터링 + 폼 검증 추가',
  runId: 142,
  main: {
    name: '오케스트레이터',
    role: 'Main Agent',
    modelId: 'claude',
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
      id: 'ui', name: 'UI 빌더', role: 'UI Builder', modelId: 'gpt', status: 'done', order: 1, progress: 100,
      elapsed: '41s', files: ['LoginForm.tsx'], current: 'LoginForm.tsx 생성 완료',
      steps: [
        { state: 'done', head: '컴포넌트 계획', thought: '이메일·비밀번호 입력 + 로그인 버튼 구조 확정.' },
        { state: 'done', head: 'JSX 작성', thought: '접근성 라벨 포함해 폼 마크업 작성.' },
        { state: 'done', head: '스타일 적용', thought: '심플한 카드형 레이아웃으로 스타일링.' },
      ],
    },
    {
      id: 'val', name: '폼 검증기', role: 'Validator', modelId: 'claude', status: 'running', order: 2, progress: 62,
      elapsed: '0:23', files: ['validation.ts'], current: '비밀번호 규칙 작성 중 (3/5 필드)',
      steps: [
        { state: 'done', head: '검증 규칙 설계', thought: '필수·형식·길이 규칙 정의.' },
        { state: 'done', head: '이메일 검증', thought: '정규식 기반 이메일 유효성 구현.' },
        { state: 'active', head: '비밀번호 검증', thought: '최소 길이·문자 조합 규칙을 작성하는 중…', tool: 'edit validation.ts' },
        { state: 'pending', head: '에러 메시지 연결', thought: '필드별 에러 표시 연결 예정.' },
      ],
    },
    {
      id: 'test', name: '테스트 작성', role: 'Test Writer', modelId: 'kimi', status: 'running', order: 2, progress: 38,
      elapsed: '0:18', files: ['login.test.ts'], current: '로그인 성공 케이스 작성 중',
      steps: [
        { state: 'done', head: '케이스 도출', thought: '성공·실패·엣지 케이스 목록화.' },
        { state: 'active', head: '성공 케이스', thought: '정상 로그인 플로우 테스트 작성 중…', tool: 'edit login.test.ts' },
        { state: 'pending', head: '실패 케이스', thought: '잘못된 자격증명 테스트 예정.' },
      ],
    },
    {
      id: 'review', name: '검수기', role: 'Reviewer', modelId: 'gpt', status: 'queued', order: 3, progress: 0,
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
  var picking=false, region=false, hl=null, lbl=null;
  var dragging=false, pts=[], canvas=null, ctx=null;
  var hgroups={}, hgId=0;   // 파란 하이라이트 그룹: id -> [{el, box}]
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
  // ===== 서클 투 서치용 캔버스(자유곡선) =====
  function sizeCanvas(){ if(canvas){ canvas.width=window.innerWidth; canvas.height=window.innerHeight; } }
  function ensureLasso(){
    if(!canvas){
      canvas=document.createElement('canvas');
      canvas.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:99996;display:none;';
      document.body.appendChild(canvas); sizeCanvas(); ctx=canvas.getContext('2d');
    }
  }
  function drawLasso(closed){
    if(!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(pts.length<2) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
    if(closed){ ctx.closePath(); ctx.fillStyle='rgba(37,99,235,.10)'; ctx.fill(); }
    ctx.strokeStyle='#2563eb'; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.setLineDash([]); ctx.stroke();
  }
  function inPoly(x,y,poly){
    var inside=false;
    for(var i=0,j=poly.length-1;i<poly.length;j=i++){
      var xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
      if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
    }
    return inside;
  }
  // 사각형이 그린 원(폴리곤)과 겹치는지 — 중심·네 모서리·라쏘 꼭짓점을 종합 판정
  function hitsRect(r,poly){
    if(!r||(r.width===0&&r.height===0)) return false;
    var px=[r.left+r.width/2, r.left+2, r.right-2, r.left+2, r.right-2];
    var py=[r.top+r.height/2, r.top+2, r.top+2, r.bottom-2, r.bottom-2];
    for(var i=0;i<px.length;i++) if(inPoly(px[i],py[i],poly)) return true;
    for(var j=0;j<poly.length;j++){ var p=poly[j];
      if(p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom) return true; }
    return false;
  }
  // ===== 파란 하이라이트 박스 그룹 (실제 DOM 요소 참조로 관리) =====
  function makeBox(){
    var b=document.createElement('div');
    b.style.cssText='position:fixed;pointer-events:none;z-index:99995;border:2px solid #2563eb;border-radius:6px;background:rgba(37,99,235,.10);box-shadow:0 0 0 1px rgba(37,99,235,.25);';
    document.body.appendChild(b); return b;
  }
  function placeBox(b,el){
    var r=repRect(el);   // 텍스트는 글자에, 박스는 박스에 딱 맞게 하이라이트
    b.style.left=(r.left-2)+'px'; b.style.top=(r.top-2)+'px';
    b.style.width=(r.width+4)+'px'; b.style.height=(r.height+4)+'px';
  }
  function highlightGroup(els){
    var id=++hgId, arr=[];
    for(var i=0;i<els.length;i++){ var b=makeBox(); placeBox(b,els[i]); arr.push({el:els[i],box:b}); }
    hgroups[id]=arr; return id;
  }
  function removeGroup(id){
    var g=hgroups[id]; if(!g) return;
    for(var i=0;i<g.length;i++){ if(g[i].box.parentNode) g[i].box.parentNode.removeChild(g[i].box); }
    delete hgroups[id];
  }
  function syncGroups(keep){
    var set={}; for(var i=0;i<keep.length;i++) set[keep[i]]=1;
    for(var id in hgroups){ if(!set[id]) removeGroup(id); }
  }
  function reposition(){
    for(var id in hgroups){ var g=hgroups[id]; for(var i=0;i<g.length;i++) placeBox(g[i].box,g[i].el); }
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
  // 실제 렌더된 텍스트(글자)의 타이트한 사각형. 좌측정렬 블록에서도 글자 위를 정확히 가리킨다.
  function contentRect(el){
    try{
      var range=document.createRange(); range.selectNodeContents(el);
      var rr=range.getBoundingClientRect();
      if(rr && (rr.width>0 || rr.height>0)) return rr;
    }catch(e){}
    return el.getBoundingClientRect();
  }
  // 판정/하이라이트에 쓸 기준 사각형:
  //  - 인라인 텍스트 리프(제목·문단·링크·span 등, 자식 없음)는 글자 rect → 좌측정렬 텍스트도 정확히 잡힘
  //  - 버튼·입력·박스 컨테이너(hero 등)는 요소 박스 → 박스를 감싸면 박스 전체가 하이라이트됨
  //    ('자식 없음=텍스트' 휴리스틱은 자식 없는 박스 요소(button, .hero)를 오분류하므로 태그로 판정)
  function isTextLeaf(el){
    var tag=el.tagName.toLowerCase();
    var text=(tag==='h1'||tag==='h2'||tag==='h3'||tag==='h4'||tag==='h5'||tag==='h6'||tag==='p'||tag==='a'||tag==='span'||tag==='li');
    return text && (!el.children || el.children.length===0);
  }
  function repRect(el){
    if(isTextLeaf(el)) return contentRect(el);
    return el.getBoundingClientRect();
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
  // ===== 서클 투 서치 (자유곡선으로 원을 그려 감싼 요소 선택) =====
  function rdown(e){
    if(!region) return;
    e.preventDefault(); ensureLasso();
    dragging=true; pts=[{x:e.clientX,y:e.clientY}];
    canvas.style.display='block'; drawLasso(false);
  }
  function rmove(e){
    if(!region||!dragging) return;
    pts.push({x:e.clientX,y:e.clientY}); drawLasso(false);
  }
  function rup(e){
    if(!region||!dragging) return;
    dragging=false; drawLasso(true);
    // 그린 경로의 bounding box
    var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
    for(var i=0;i<pts.length;i++){ var p=pts[i];
      if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; }
    // 중심이 원 안에 들어온 요소 선택 (컨테이너 div뿐 아니라 텍스트 요소도 후보)
    var els=[], nodes=document.querySelectorAll('[data-label], h1, h2, h3, h4, h5, h6, p, a, span, button, input, li');
    for(var k=0;k<nodes.length;k++){
      var n=nodes[k];
      if(labelFor(n)==null) continue;                 // 의미 없는 요소 제외
      if(pts.length<3) continue;
      var br=n.getBoundingClientRect();               // 요소 박스
      var tr=contentRect(n);                          // 실제 글자 사각형
      // 박스 또는 글자 사각형이 그린 원과 겹치면 선택 (텍스트/박스 모두 견고)
      if(hitsRect(br,pts) || hitsRect(tr,pts)) els.push(n);
    }
    // 그린 원 흔적 지우기
    setTimeout(function(){ if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height); if(canvas) canvas.style.display='none'; },160);
    var groupId = els.length ? highlightGroup(els) : 0;
    var payload=[]; for(var m=0;m<els.length;m++) payload.push({label:labelFor(els[m])||els[m].getAttribute('data-label'),selector:pathFor(els[m])});
    parent.postMessage({source:'vibe-preview',type:'region',groupId:groupId,rect:{x:minX,y:minY,w:maxX-minX,h:maxY-minY},elements:payload},'*');
  }
  window.addEventListener('mousemove',move,true);
  window.addEventListener('click',click,true);
  window.addEventListener('mousedown',rdown,true);
  window.addEventListener('mousemove',rmove,true);
  window.addEventListener('mouseup',rup,true);
  window.addEventListener('scroll',reposition,true);
  window.addEventListener('resize',function(){ sizeCanvas(); reposition(); });
  window.addEventListener('message',function(e){
    var d=e.data||{};
    if(d.type==='qmode'){ picking=!!d.on; ensure();
      if(!picking){ hl.style.display='none'; lbl.style.display='none'; }
    }
    if(d.type==='region'){ region=!!d.on; ensureLasso();
      if(!region){ dragging=false; if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height); if(canvas) canvas.style.display='none'; }
    }
    if(d.type==='syncHighlights'){ syncGroups(d.keep||[]); }
    document.body.style.cursor=(picking||region)?'crosshair':'';
  });
})();
<\/script>
</body></html>`
