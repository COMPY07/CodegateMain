// 필요한 언어만 등록해 번들을 작게 유지하는 highlight.js 설정.
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github.css'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import bash from 'highlight.js/lib/languages/bash'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('bash', bash)

// 파일 뷰어에서 쓰는 언어명을 hljs 언어명으로 매핑한다.
const LANGUAGE_ALIASES = {
  jsx: 'javascript',
  js: 'javascript',
  tsx: 'typescript',
  ts: 'typescript',
  html: 'xml',
  shell: 'bash',
  sh: 'bash',
}

export function highlightCode(code, language) {
  const resolved = LANGUAGE_ALIASES[language] || language
  if (resolved && hljs.getLanguage(resolved)) {
    return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value
  }
  return hljs.highlightAuto(code).value
}

export default hljs
