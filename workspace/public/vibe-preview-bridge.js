/* Vibe Studio 프리뷰 브리지 (개발 전용)
 *
 * 스튜디오의 iframe 안에서 실행되며 "질문 모드"(요소 클릭)와 "서클 투 서치"(영역 선택)를
 * 지원한다. 부모 창과의 통신은 양쪽 모두 e.source 를 검증한다:
 *   - 이 스크립트는 window.parent 가 보낸 메시지만 받아들이고,
 *   - 그때 확인한 origin 으로만 회신한다(와일드카드로 데이터를 보내지 않는다).
 *
 * 사용자 프로젝트에 붙이려면 이 파일을 public/ 에 두고 vite.config.js 에
 * vibePreviewBridge() 플러그인을 추가하면 된다. 프로덕션 빌드에는 포함되지 않는다.
 */
(function () {
  if (window.__vibeBridgeLoaded) return
  window.__vibeBridgeLoaded = true

  var picking = false, region = false, hl = null, lbl = null
  var dragging = false, pts = [], canvas = null, ctx = null
  var hgroups = {}, hgId = 0
  var parentOrigin = null   // 부모의 첫 메시지에서 확인한다

  function postToParent(payload) {
    // origin 을 아직 모르면 보내지 않는다(데이터가 임의 페이지로 새지 않도록).
    if (!parentOrigin) return
    parent.postMessage(Object.assign({ source: 'vibe-preview' }, payload), parentOrigin)
  }

  // ===== 하이라이트 오버레이 =====
  function ensure() {
    if (hl) return
    hl = document.createElement('div')
    hl.style.cssText = 'position:fixed;pointer-events:none;z-index:99998;border:2px solid #7c3aed;border-radius:6px;background:rgba(124,58,237,.12);transition:all .04s;display:none;'
    document.body.appendChild(hl)
    lbl = document.createElement('div')
    lbl.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;background:#7c3aed;color:#fff;font:700 12px -apple-system,sans-serif;padding:3px 9px;border-radius:6px;white-space:nowrap;display:none;box-shadow:0 4px 12px rgba(124,58,237,.5);'
    document.body.appendChild(lbl)
  }

  // ===== 서클 투 서치 캔버스 =====
  function sizeCanvas() { if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight } }
  function ensureLasso() {
    if (canvas) return
    canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99996;display:none;'
    document.body.appendChild(canvas); sizeCanvas(); ctx = canvas.getContext('2d')
  }
  function drawLasso(closed) {
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (pts.length < 2) return
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (closed) { ctx.closePath(); ctx.fillStyle = 'rgba(37,99,235,.10)'; ctx.fill() }
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.setLineDash([]); ctx.stroke()
  }
  function inPoly(x, y, poly) {
    var inside = false
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
    }
    return inside
  }
  function hitsRect(r, poly) {
    if (!r || (r.width === 0 && r.height === 0)) return false
    var px = [r.left + r.width / 2, r.left + 2, r.right - 2, r.left + 2, r.right - 2]
    var py = [r.top + r.height / 2, r.top + 2, r.top + 2, r.bottom - 2, r.bottom - 2]
    for (var i = 0; i < px.length; i++) if (inPoly(px[i], py[i], poly)) return true
    for (var j = 0; j < poly.length; j++) {
      var p = poly[j]
      if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) return true
    }
    return false
  }

  // ===== 파란 하이라이트 그룹 =====
  function makeBox() {
    var b = document.createElement('div')
    b.style.cssText = 'position:fixed;pointer-events:none;z-index:99995;border:2px solid #2563eb;border-radius:6px;background:rgba(37,99,235,.10);box-shadow:0 0 0 1px rgba(37,99,235,.25);'
    document.body.appendChild(b); return b
  }
  function placeBox(b, el) {
    var r = repRect(el)
    b.style.left = (r.left - 2) + 'px'; b.style.top = (r.top - 2) + 'px'
    b.style.width = (r.width + 4) + 'px'; b.style.height = (r.height + 4) + 'px'
  }
  function highlightGroup(els) {
    var id = ++hgId, arr = []
    for (var i = 0; i < els.length; i++) { var b = makeBox(); placeBox(b, els[i]); arr.push({ el: els[i], box: b }) }
    hgroups[id] = arr; return id
  }
  function removeGroup(id) {
    var g = hgroups[id]; if (!g) return
    for (var i = 0; i < g.length; i++) if (g[i].box.parentNode) g[i].box.parentNode.removeChild(g[i].box)
    delete hgroups[id]
  }
  function syncGroups(keep) {
    var set = {}; for (var i = 0; i < keep.length; i++) set[keep[i]] = 1
    for (var id in hgroups) if (!set[id]) removeGroup(id)
  }
  function reposition() {
    for (var id in hgroups) { var g = hgroups[id]; for (var i = 0; i < g.length; i++) placeBox(g[i].box, g[i].el) }
  }

  // ===== 라벨 / 셀렉터 =====
  function labelFor(el) {
    if (!el || el === document.body || el === document.documentElement) return null
    var dl = el.getAttribute && el.getAttribute('data-label'); if (dl) return dl
    var tag = el.tagName.toLowerCase()
    var ph = el.getAttribute && el.getAttribute('placeholder')
    if (tag === 'input') { return ph ? ph + ' 입력 필드' : '입력 필드' }
    if (tag === 'button') return (el.textContent.trim() || '버튼') + ' 버튼'
    if (tag === 'a') return (el.textContent.trim() || '링크') + ' 링크'
    if (tag === 'nav') return '네비게이션 바'
    if (tag === 'header') return '상단 헤더'
    if (/^h[1-3]$/.test(tag)) return '제목: ' + el.textContent.trim().slice(0, 16)
    var t = el.textContent.trim(); if (t && t.length < 20) return t
    return tag + ' 영역'
  }
  function pathFor(el) {
    var parts = []
    while (el && el.nodeType === 1 && el !== document.body && parts.length < 5) {
      var s = el.tagName.toLowerCase()
      if (el.className && typeof el.className === 'string') {
        var c = el.className.trim().split(/\s+/)[0]; if (c) s += '.' + c
      }
      parts.unshift(s); el = el.parentElement
    }
    return parts.join(' > ')
  }
  function contentRect(el) {
    try {
      var range = document.createRange(); range.selectNodeContents(el)
      var rr = range.getBoundingClientRect()
      if (rr && (rr.width > 0 || rr.height > 0)) return rr
    } catch (e) { /* ignore */ }
    return el.getBoundingClientRect()
  }
  function isTextLeaf(el) {
    var tag = el.tagName.toLowerCase()
    var text = ['h1','h2','h3','h4','h5','h6','p','a','span','li'].indexOf(tag) !== -1
    return text && (!el.children || el.children.length === 0)
  }
  function repRect(el) { return isTextLeaf(el) ? contentRect(el) : el.getBoundingClientRect() }

  // ===== 질문 모드 =====
  function move(e) {
    if (!picking) return
    ensure()
    var el = e.target, lab = labelFor(el)
    if (!lab) { hl.style.display = 'none'; lbl.style.display = 'none'; return }
    var r = el.getBoundingClientRect()
    hl.style.display = 'block'; hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px'
    hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px'
    lbl.style.display = 'block'; lbl.textContent = '📍 ' + lab
    var ly = r.top - 26; if (ly < 2) ly = r.bottom + 6
    lbl.style.left = r.left + 'px'; lbl.style.top = ly + 'px'
  }
  function click(e) {
    if (!picking) return
    e.preventDefault(); e.stopPropagation()
    var el = e.target, lab = labelFor(el); if (!lab) return
    postToParent({ type: 'pick', label: lab, selector: pathFor(el) })
    hl.style.transform = 'scale(1.04)'; setTimeout(function () { if (hl) hl.style.transform = '' }, 120)
  }

  // ===== 서클 투 서치 =====
  function rdown(e) {
    if (!region) return
    e.preventDefault(); ensureLasso()
    dragging = true; pts = [{ x: e.clientX, y: e.clientY }]
    canvas.style.display = 'block'; drawLasso(false)
  }
  function rmove(e) {
    if (!region || !dragging) return
    pts.push({ x: e.clientX, y: e.clientY }); drawLasso(false)
  }
  function rup() {
    if (!region || !dragging) return
    dragging = false; drawLasso(true)
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i]
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
    }
    var els = [], nodes = document.querySelectorAll('[data-label], h1, h2, h3, h4, h5, h6, p, a, span, button, input, li')
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k]
      if (labelFor(n) == null) continue
      if (pts.length < 3) continue
      if (hitsRect(n.getBoundingClientRect(), pts) || hitsRect(contentRect(n), pts)) els.push(n)
    }
    setTimeout(function () {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (canvas) canvas.style.display = 'none'
    }, 160)
    var groupId = els.length ? highlightGroup(els) : 0
    var payload = []
    for (var m = 0; m < els.length; m++) payload.push({ label: labelFor(els[m]), selector: pathFor(els[m]) })
    postToParent({
      type: 'region', groupId: groupId,
      rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      elements: payload,
    })
  }

  window.addEventListener('mousemove', move, true)
  window.addEventListener('click', click, true)
  window.addEventListener('mousedown', rdown, true)
  window.addEventListener('mousemove', rmove, true)
  window.addEventListener('mouseup', rup, true)
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', function () { sizeCanvas(); reposition() })

  window.addEventListener('message', function (e) {
    // 부모 창이 보낸 메시지만 받아들인다.
    if (e.source !== window.parent) return
    var d = e.data || {}
    if (typeof d.type !== 'string') return
    parentOrigin = e.origin   // 이후 회신은 이 origin 으로만 보낸다

    if (d.type === 'qmode') {
      picking = !!d.on; ensure()
      if (!picking) { hl.style.display = 'none'; lbl.style.display = 'none' }
    }
    if (d.type === 'region') {
      region = !!d.on; ensureLasso()
      if (!region) {
        dragging = false
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (canvas) canvas.style.display = 'none'
      }
    }
    if (d.type === 'syncHighlights') syncGroups(Array.isArray(d.keep) ? d.keep : [])
    document.body.style.cursor = (picking || region) ? 'crosshair' : ''
  })

  // 부모에게 준비 완료를 알린다(내용이 없어 와일드카드로 보내도 안전하다).
  // 부모는 이 신호를 받고 현재 모드를 다시 보낸다 — 예전의 setTimeout 재전송 해킹을 대체한다.
  parent.postMessage({ source: 'vibe-preview', type: 'ready' }, '*')
})()
