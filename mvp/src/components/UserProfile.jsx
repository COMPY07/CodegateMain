import { useEffect, useRef, useState } from 'react'
import '../profile-settings.css'

const SETTINGS_KEY = 'vibe-studio.settings.v1'
const DEFAULT_SETTINGS = {
  language: 'ko',
  startTab: 'live',
  workspacePath: '',
  reducedMotion: false,
  highContrast: false,
}

const SETTINGS_TABS = [
  { id: 'general', icon: '◉', label: '일반' },
  { id: 'models', icon: '✦', label: 'AI 모델' },
  { id: 'project', icon: '◇', label: '프로젝트' },
  { id: 'accessibility', icon: '◎', label: '접근성' },
  { id: 'account', icon: '○', label: '계정' },
]

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}
    return { ...DEFAULT_SETTINGS, ...stored }
  }
  catch { return DEFAULT_SETTINGS }
}

function applyAccessibilitySettings(settings) {
  document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion)
  document.documentElement.classList.toggle('high-contrast', settings.highContrast)
}

function SettingRow({ title, description, children }) {
  return <div className="setting-row"><div className="setting-copy"><strong>{title}</strong>{description && <span>{description}</span>}</div><div className="setting-control">{children}</div></div>
}

function SettingsContent({ tab, settings, update }) {
  if (tab === 'general') return <>
    <div className="settings-section-title">일반</div>
    <p className="settings-section-desc">Vibe Studio의 기본 실행 환경을 설정합니다.</p>
    <SettingRow title="표시 언어" description="인터페이스에 사용할 언어입니다."><select value={settings.language} onChange={event => update('language', event.target.value)}><option value="ko">한국어</option><option value="en">English</option></select></SettingRow>
    <SettingRow title="시작 화면" description="앱을 열었을 때 처음 표시할 탭입니다."><select value={settings.startTab} onChange={event => update('startTab', event.target.value)}><option value="live">라이브 웹</option><option value="cot">에이전트 진행</option><option value="dash">대시보드</option></select></SettingRow>
  </>

  if (tab === 'models') return <>
    <div className="settings-section-title">AI 모델</div>
    <p className="settings-section-desc">연결된 모델과 API 제공자를 관리합니다.</p>
    <div className="settings-callout"><span>✦</span><div><strong>모델 연결은 현재 미리보기입니다.</strong><p>실제 API 키 등록과 검증은 BE-009 연동 후 이 화면으로 통합됩니다.</p></div></div>
    <SettingRow title="기본 모델" description="현재 왼쪽 모델 선택기에서 변경할 수 있습니다."><span className="settings-value">Claude</span></SettingRow>
  </>

  if (tab === 'project') return <>
    <div className="settings-section-title">프로젝트</div>
    <p className="settings-section-desc">프로젝트와 프리뷰의 기본 동작을 설정합니다.</p>
    <SettingRow title="기본 프로젝트 경로" description="BE-001 파일시스템 연동 후 실제 경로 검증을 지원합니다."><input value={settings.workspacePath} onChange={event => update('workspacePath', event.target.value)} placeholder="예: D:\\Projects" /></SettingRow>
    <SettingRow title="Hot reload" description="프리뷰 변경사항을 자동으로 다시 불러옵니다."><span className="settings-state on">켜짐</span></SettingRow>
  </>

  if (tab === 'accessibility') return <>
    <div className="settings-section-title">접근성</div>
    <p className="settings-section-desc">움직임과 화면 대비를 사용자 환경에 맞춥니다.</p>
    <SettingRow title="애니메이션 줄이기" description="불필요한 전환과 반복 애니메이션을 줄입니다."><label className="switch"><input type="checkbox" checked={settings.reducedMotion} onChange={event => update('reducedMotion', event.target.checked)} /><span /></label></SettingRow>
    <SettingRow title="고대비 표시" description="경계선과 포커스 표시를 더 선명하게 만듭니다."><label className="switch"><input type="checkbox" checked={settings.highContrast} onChange={event => update('highContrast', event.target.checked)} /><span /></label></SettingRow>
  </>

  return <>
    <div className="settings-section-title">계정</div>
    <p className="settings-section-desc">현재 로그인된 사용자 프로필입니다.</p>
    <div className="account-card"><span className="profile-avatar large">T</span><div><strong>Team 14</strong><span>team14@vibestudio.local</span></div><span className="profile-mock-badge">목업 계정</span></div>
    <SettingRow title="프로필 동기화" description="인증 백엔드 연결 후 이름과 이미지를 수정할 수 있습니다."><span className="settings-value">연결 대기</span></SettingRow>
  </>
}

function SettingsDialog({ onClose }) {
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* 저장 불가 환경은 무시 */ }
    applyAccessibilitySettings(settings)
  }, [settings])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (key, value) => setSettings(current => ({ ...current, [key]: value }))
  const activeLabel = SETTINGS_TABS.find(item => item.id === tab)?.label

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="설정" onMouseDown={event => event.stopPropagation()}>
        <header className="settings-head"><div><strong>설정</strong><span>{activeLabel}</span></div><button onClick={onClose} aria-label="설정 닫기">✕</button></header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="설정 카테고리">{SETTINGS_TABS.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
          <main className="settings-content"><SettingsContent tab={tab} settings={settings} update={update} /></main>
        </div>
        <footer className="settings-foot"><span>변경사항은 이 브라우저에 자동 저장됩니다.</span><button onClick={onClose}>완료</button></footer>
      </section>
    </div>
  )
}

export default function UserProfile({ collapsed = false }) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const ref = useRef(null)

  useEffect(() => { applyAccessibilitySettings(loadSettings()) }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  const unavailable = label => { setNotice(`${label} 기능은 계정 백엔드 연동 후 제공됩니다.`) }

  return (
    <>
      <div className={`profile-foot${collapsed ? ' mini' : ''}`} ref={ref}>
        {open && <div className={`profile-menu${collapsed ? ' from-mini' : ''}`}>
          <div className="profile-menu-head"><span className="profile-avatar">T</span><div><strong>Team 14</strong><span>team14@vibestudio.local</span></div></div>
          <div className="profile-menu-sep" />
          <button onClick={() => { setOpen(false); setSettingsOpen(true) }}><span>⚙</span>설정</button>
          <button onClick={() => unavailable('키보드 단축키')}><span>⌨</span>키보드 단축키</button>
          <button onClick={() => unavailable('도움말')}><span>?</span>도움말</button>
          <div className="profile-menu-sep" />
          <button className="danger" onClick={() => unavailable('로그아웃')}><span>↪</span>로그아웃</button>
          {notice && <div className="profile-menu-note">{notice}</div>}
        </div>}
        <button className={collapsed ? 'profile-mini' : 'profile-current'} onClick={() => { setOpen(value => !value); setNotice('') }} aria-expanded={open} aria-haspopup="menu" title={collapsed ? 'Team 14 · 프로필 및 설정' : undefined}>
          <span className="profile-avatar">T</span>
          {!collapsed && <><span className="profile-info"><strong>Team 14</strong><span>프로필 및 설정</span></span><span className="profile-caret">{open ? '⌃' : '⌄'}</span></>}
        </button>
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
