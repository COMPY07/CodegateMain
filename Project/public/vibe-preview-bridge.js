// Vibe Studio 프리뷰 브리지 — dev 서버에서만 주입된다.
(function () {
  if (window.top === window) return
  var parentOrigin = null

  function describe(el) {
    var label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim()
    var selector = el.tagName.toLowerCase()
    if (el.id) selector += '#' + el.id
    else if (el.className && typeof el.className === 'string')
      selector += '.' + el.className.trim().split(/\s+/).join('.')
    return { label: label.slice(0, 40), selector: selector }
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return
    var d = e.data
    if (!d || d.source !== 'vibe-studio') return
    parentOrigin = e.origin
    if (d.type === 'ready') {
      window.parent.postMessage({ source: 'vibe-preview', type: 'ready' }, parentOrigin)
    }
  })

  document.addEventListener('click', function (ev) {
    if (!parentOrigin) return
    var info = describe(ev.target)
    window.parent.postMessage(
      { source: 'vibe-preview', type: 'pick', label: info.label, selector: info.selector },
      parentOrigin,
    )
  }, true)
})()
