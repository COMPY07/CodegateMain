import { useState } from 'react'

const PROFILE = {
  name: '이정훈',
  role: '프론트엔드 개발자',
  tagline: '사용자에게 닿는 화면을 만드는 일을 좋아합니다.',
  initial: '이',
}

const CONTACTS = [
  { label: '이메일', value: 'dlwjdgns13579@gmail.com' },
  { label: '위치', value: '대한민국 서울' },
  { label: '관심 분야', value: '웹 프론트엔드 · 개발자 도구' },
]

const SKILLS = ['React', 'JavaScript', 'TypeScript', 'Vite', 'CSS', 'Node.js']

const TABS = [
  {
    id: 'about',
    label: '소개',
    body: [
      '안녕하세요, 프론트엔드 개발자 이정훈입니다.',
      '작은 화면 하나도 쓰는 사람 입장에서 다시 보는 습관을 가지고 있습니다. 복잡한 기능을 단순한 흐름으로 정리하고, 읽기 좋은 코드로 남기는 것을 중요하게 생각합니다.',
      '최근에는 개발자 생산성을 높이는 도구와 접근성 있는 UI 설계에 관심을 두고 있습니다.',
    ],
  },
  {
    id: 'career',
    label: '경험',
    body: [
      '웹 서비스의 화면 설계부터 구현, 개선까지 전 과정을 경험했습니다.',
      '디자인 시스템을 정리해 반복되는 UI 작업 시간을 줄이고, 컴포넌트 재사용성을 높이는 작업을 진행했습니다.',
      '팀 내 코드 리뷰 문화를 만들고 유지하는 데 기여했습니다.',
    ],
  },
  {
    id: 'value',
    label: '가치관',
    body: [
      '기술은 목적이 아니라 문제를 푸는 수단이라고 생각합니다.',
      '혼자 빨리 가기보다 함께 오래 갈 수 있는 구조를 선호합니다.',
      '기록으로 남기지 않은 결정은 사라진다고 믿어서, 문서와 커밋 메시지에 신경 씁니다.',
    ],
  },
]

export default function Profile() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const current = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  return (
    <section className="profile" aria-labelledby="profile-name">
      <div className="profile-card">
        <div className="profile-avatar" aria-hidden="true">
          {PROFILE.initial}
        </div>
        <div className="profile-heading">
          <h1 id="profile-name">{PROFILE.name}</h1>
          <p className="profile-role">{PROFILE.role}</p>
          <p className="profile-tagline">{PROFILE.tagline}</p>
        </div>
      </div>

      <dl className="profile-contacts">
        {CONTACTS.map((item) => (
          <div className="contact-item" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="profile-section">
        <h2>기술 스택</h2>
        <ul className="skill-list">
          {SKILLS.map((skill) => (
            <li className="skill-chip" key={skill}>
              {skill}
            </li>
          ))}
        </ul>
      </div>

      <div className="profile-section">
        <h2>더 알아보기</h2>
        <div className="tab-bar" role="tablist" aria-label="자기소개 항목">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              className={`tab-button${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="tab-panel"
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
        >
          {current.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  )
}
