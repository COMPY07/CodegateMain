import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github.css'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)

const LANGUAGE_ALIASES = {
  bash: 'bash', shell: 'bash', sh: 'bash',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  html: 'xml', jsx: 'javascript', js: 'javascript',
  tsx: 'typescript', ts: 'typescript',
}

export function highlightCode(code, language) {
  const resolved = LANGUAGE_ALIASES[language] || language
  if (resolved && hljs.getLanguage(resolved)) {
    return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value
  }
  return hljs.highlightAuto(code).value
}

export default hljs
