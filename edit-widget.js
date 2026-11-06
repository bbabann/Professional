// 수정 요청 위젯 — script.js가 "편집 모드"일 때만 불러옵니다 (방문자에게는 로드되지 않음).
// 사용법 1) 텍스트를 드래그 → "✎ 수정 요청" → 요청 입력 → GitHub 이슈 작성 화면이 채워진 채로 열림 → Submit.
// 사용법 2) 오른쪽 아래 "요소 선택" → 화면의 아무 영역이나 클릭(글자 없어도 됨) → 요청 입력 → 같은 흐름.
//          선택 중에 ↑/↓ 키로 범위를 넓히거나 좁히고(섹션 전체 등), Esc로 취소. 창이 열린 뒤에는 "↑ 상위 요소" 버튼으로도 넓힐 수 있음.
(() => {
  const REPO = 'bbabann/Professional';
  const LABEL = 'site-edit';       // 이슈에 붙는 라벨 (저장소에 없으면 GitHub가 무시함)
  const MAX_TEXT = 200;            // 이슈에 담을 선택 텍스트 최대 길이
  const MAX_URL = 7000;            // GitHub 새 이슈 URL 길이 안전선

  if (window.__editWidget) return;
  window.__editWidget = true;

  const CSS = `
    html.ew-on a, html.ew-on img { -webkit-user-drag: none; user-select: text; }
    html.ew-pick, html.ew-pick * { cursor: crosshair !important; }
    .ew-fab { position: fixed; z-index: 2147483000; display: none; padding: 8px 13px; border: 0; border-radius: 999px;
      background: #111; color: #fff; font: 500 13px/1 system-ui, -apple-system, "Pretendard Variable", sans-serif;
      box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }
    .ew-fab.show { display: block; }
    .ew-box { position: fixed; z-index: 2147483001; left: 50%; bottom: 24px; transform: translateX(-50%);
      width: min(460px, calc(100vw - 24px)); box-sizing: border-box; padding: 14px; display: none;
      border: 1px solid rgba(0,0,0,.12); border-radius: 14px; background: #fff; color: #111;
      box-shadow: 0 12px 40px rgba(0,0,0,.22); font: 14px/1.5 system-ui, -apple-system, "Pretendard Variable", sans-serif; }
    .ew-box.show { display: block; }
    .ew-quote { margin: 0 0 10px; padding: 8px 10px; border-left: 3px solid #facc15; background: #fafafa; color: #555;
      font-size: 12.5px; max-height: 64px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
    .ew-quote.el { border-left-color: #2563eb; }
    .ew-box textarea { display: block; width: 100%; min-height: 84px; box-sizing: border-box; padding: 9px 10px;
      border: 1px solid #ddd; border-radius: 8px; font: inherit; color: inherit; background: #fff; resize: vertical; }
    .ew-box textarea:focus { outline: 2px solid #111; outline-offset: -1px; }
    .ew-box textarea.err { border-color: #dc2626; }
    .ew-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
    .ew-note { margin-right: auto; font-size: 12px; line-height: 1.4; color: #b45309; }
    .ew-btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #ddd; background: #fff; color: #111; font: inherit; cursor: pointer; }
    .ew-btn:disabled { opacity: .4; cursor: default; }
    .ew-btn.primary { border-color: #111; background: #111; color: #fff; }
    .ew-pill { position: fixed; z-index: 2147482999; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 6px;
      padding: 6px 6px 6px 12px; border-radius: 999px; background: rgba(17,17,17,.88); color: #fff;
      font: 12px/1 system-ui, -apple-system, "Pretendard Variable", sans-serif; }
    .ew-pill button { padding: 5px 9px; border: 0; border-radius: 999px; background: rgba(255,255,255,.18); color: #fff; font: inherit; cursor: pointer; }
    .ew-pill button.on { background: #2563eb; }
    .ew-hl { position: fixed; z-index: 2147482998; display: none; pointer-events: none; box-sizing: border-box;
      border: 2px solid #2563eb; background: rgba(37,99,235,.08); border-radius: 2px; }
    .ew-hl.show { display: block; }
    .ew-hl-label { position: absolute; left: -2px; bottom: 100%; margin-bottom: 2px; padding: 3px 7px; border-radius: 4px;
      background: #2563eb; color: #fff; font: 500 11px/1.2 ui-monospace, Menlo, Consolas, monospace; white-space: nowrap; }
    .ew-hl.below .ew-hl-label { bottom: auto; top: 100%; margin: 2px 0 0; }
  `;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  const SKIP_CLASS = new Set(['js', 'js-motion', 'in', 'rv', 'ready', 'open', 'loaded', 'embed', 'split', 'ew-on', 'ew-pick']);
  const UI_SEL = '.ew-box, .ew-fab, .ew-pill, .ew-hl';
  const isBoundary = (n) => !n || n === document.body || n === document.documentElement;

  // 요소 → "section.hero > h1" 같은 CSS 경로 (Claude가 코드에서 위치를 찾는 단서)
  function cssPath(node) {
    const parts = [];
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      let s = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(s + '#' + node.id); break; }
      const cls = [...node.classList].filter((c) => !SKIP_CLASS.has(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      const sibs = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [];
      if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  // 화면에 띄울 짧은 이름: "section.hero"
  function labelOf(node) {
    const cls = [...node.classList].filter((c) => !SKIP_CLASS.has(c)).slice(0, 2);
    return node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + (cls.length ? '.' + cls.join('.') : '');
  }

  // 현재 주소 → 코드에서 어느 파일인지 힌트. posts/·work/ 페이지는 템플릿 + Notion 본문
  function sourceHint() {
    const p = location.pathname;
    if (/\/posts\/[^/]+\.html$/.test(p)) return 'article.html 템플릿 (본문·제목은 Notion)';
    if (/\/work\/[^/]+\.html$/.test(p)) return 'project.html 템플릿 (본문·제목은 Notion)';
    const f = p.split('/').pop();
    return /\.html$/.test(f) ? f : 'index.html';
  }

  function cleanUrl() {
    const u = new URL(location.href);
    u.searchParams.delete('embed');
    u.searchParams.delete('v');
    u.searchParams.delete('edit');
    u.hash = '';
    return u.href;
  }

  // 선택 대상 요약. 무거운 값(스타일, HTML)은 제출할 때 details()로 계산
  function describeEl(node, kind, text) {
    const own = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      el: node,
      kind, // 'text' = 드래그한 글자, 'element' = 요소 클릭
      text: text != null ? text : own,
      path: cssPath(node),
      label: labelOf(node),
      notion: !!node.closest('.prose, .article-head, .rows'),
    };
  }

  function details(node) {
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    let html = node.outerHTML.replace(/\s+/g, ' ');
    if (html.length > 300) html = html.slice(0, 300) + '…';
    const font = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    const style = Math.round(r.width) + '×' + Math.round(r.height) + 'px, color ' + cs.color + ', background ' + cs.backgroundColor +
      ', font ' + cs.fontSize + ' ' + font + ', margin ' + cs.margin + ', padding ' + cs.padding + ', display ' + cs.display;
    return { html, style };
  }

  function buildIssueUrl(request, sel, textLimit, withHtml) {
    const d = details(sel.el);
    const text = sel.text.length > textLimit ? sel.text.slice(0, textLimit) + '…' : sel.text;
    const lines = [
      '@claude 아래 요청대로 사이트 코드를 수정하고 PR을 열어줘. (규칙은 저장소의 CLAUDE.md 참고)',
      '',
      '## 요청',
      request,
      '',
      '## 선택한 위치',
      '- 페이지: ' + cleanUrl(),
      '- 소스 파일 힌트: ' + sourceHint(),
      sel.kind === 'text'
        ? '- 선택한 텍스트: > ' + text
        : '- 선택 방식: 요소 클릭 (요소 안 텍스트: > ' + (text || '없음') + ')',
      '- 요소(CSS 경로): `' + sel.path + '`',
      '- 현재 스타일: ' + d.style,
      '- 화면 너비: ' + window.innerWidth + 'px',
    ];
    if (sel.notion) lines.push('- ⚠️ Notion에서 가져온 영역일 수 있음: 글/프로젝트 내용 자체는 코드가 아니라 Notion에서 바꿔야 함');
    if (withHtml) lines.push('', '### 요소 HTML (일부)', '```html', d.html, '```');
    const title = '[사이트 수정] ' + request.replace(/\s+/g, ' ').slice(0, 40);
    const q = new URLSearchParams({ title, body: lines.join('\n'), labels: LABEL });
    return 'https://github.com/' + REPO + '/issues/new?' + q.toString();
  }

  function init() {
    document.documentElement.classList.add('ew-on');
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const fab = el('button', 'ew-fab', '✎ 수정 요청');
    fab.type = 'button';
    const box = el('div', 'ew-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '수정 요청');
    const quote = el('div', 'ew-quote');
    const ta = el('textarea');
    ta.placeholder = '어떻게 바꾸고 싶나요? 예) 이 영역 간격을 넓혀줘, 제목을 더 크게';
    const row = el('div', 'ew-row');
    const note = el('span', 'ew-note');
    const up = el('button', 'ew-btn', '↑ 상위 요소');
    up.type = 'button';
    up.title = '선택 범위를 한 단계 넓힘 (예: 제목 → 섹션 전체)';
    const cancel = el('button', 'ew-btn', '취소');
    cancel.type = 'button';
    const send = el('button', 'ew-btn primary', 'GitHub로 보내기 ↗');
    send.type = 'button';
    row.append(note, up, cancel, send);
    box.append(quote, ta, row);

    const hl = el('div', 'ew-hl');
    const hlLabel = el('div', 'ew-hl-label');
    hl.appendChild(hlLabel);
    document.body.append(fab, box, hl);

    let pickBtn = null;
    let setPickRef = () => {};

    // 편집 모드 표시 + 요소 선택 + 끄기 (맨 위 창에서만)
    if (!document.documentElement.classList.contains('embed')) {
      const pill = el('div', 'ew-pill', '✎ 편집 모드');
      pickBtn = el('button', '', '요소 선택');
      pickBtn.type = 'button';
      pickBtn.addEventListener('click', () => setPickRef(!pickMode));
      const off = el('button', '', '끄기');
      off.type = 'button';
      off.addEventListener('click', () => {
        try { localStorage.removeItem('edit-mode'); } catch (_) { /* 무시 */ }
        const u = new URL(location.href);
        u.searchParams.delete('edit');
        location.href = u.href;
      });
      pill.append(pickBtn, off);
      document.body.appendChild(pill);
    }

    let saved = null;
    let boxOpen = false;
    let pickMode = false;
    let hlEl = null;        // 지금 강조 표시 중인 요소
    let hoverEl = null;     // 선택 모드에서 마우스 아래(또는 ↑↓로 조정한) 요소
    let lastTarget = null;
    let hoverStack = [];    // ↑로 올라온 경로 (↓로 되돌아가기)

    // ---- 강조 표시 ----
    function paintHl() {
      if (!hlEl || !hlEl.isConnected) { hl.classList.remove('show'); return; }
      const r = hlEl.getBoundingClientRect();
      hl.style.left = r.left + 'px';
      hl.style.top = r.top + 'px';
      hl.style.width = r.width + 'px';
      hl.style.height = r.height + 'px';
      hlLabel.textContent = labelOf(hlEl) + '  ' + Math.round(r.width) + '×' + Math.round(r.height);
      hl.classList.toggle('below', r.top < 26);
      hl.classList.add('show');
    }
    const repaint = () => { if (hlEl) requestAnimationFrame(paintHl); };
    document.addEventListener('scroll', repaint, { passive: true, capture: true });
    window.addEventListener('resize', repaint);

    // ---- 요소 선택 모드 ----
    function setPick(on) {
      pickMode = on;
      document.documentElement.classList.toggle('ew-pick', on);
      if (pickBtn) {
        pickBtn.classList.toggle('on', on);
        pickBtn.textContent = on ? '선택 중 · ↑↓ 범위 · Esc' : '요소 선택';
      }
      if (on) {
        const s = getSelection();
        if (s) s.removeAllRanges();
        fab.classList.remove('show');
        if (boxOpen) closeBox();
      } else {
        lastTarget = hoverEl = null;
        hoverStack = [];
        if (!boxOpen) { hlEl = null; paintHl(); }
      }
    }
    setPickRef = setPick;

    function chooseElement(node) {
      if (isBoundary(node)) return;
      saved = describeEl(node, 'element');
      setPick(false);
      openBox();
      hlEl = node; // 창이 열려 있는 동안 선택한 요소를 계속 표시
      paintHl();
    }

    // 선택 모드 이벤트는 사이트의 기존 클릭/드래그 동작(링크, 슬라이더)보다 먼저 가로챔
    document.addEventListener('pointerdown', (e) => {
      if (pickMode && !(e.target.closest && e.target.closest(UI_SEL))) e.stopPropagation();
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!pickMode) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(UI_SEL) || isBoundary(t)) return;
      if (t !== lastTarget) { lastTarget = t; hoverEl = t; hoverStack = []; }
      hlEl = hoverEl;
      paintHl();
    }, true);
    document.addEventListener('click', (e) => {
      if (!pickMode) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(UI_SEL)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      chooseElement(lastTarget === t && hoverEl ? hoverEl : t); // 터치는 hover가 없으므로 탭한 요소
    }, true);
    document.addEventListener('keydown', (e) => {
      if (!pickMode) return;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setPick(false); return; }
      if (!hoverEl) return;
      if (e.key === 'ArrowUp') {
        const p = hoverEl.parentElement;
        if (!isBoundary(p)) { hoverStack.push(hoverEl); hoverEl = p; hlEl = p; paintHl(); }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (hoverStack.length) { hoverEl = hoverStack.pop(); hlEl = hoverEl; paintHl(); }
        e.preventDefault();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        chooseElement(hoverEl);
      }
    }, true);

    // ---- 텍스트 드래그 선택 ----
    function readSelection() {
      const s = getSelection();
      if (!s || s.isCollapsed || !s.rangeCount) return null;
      const text = s.toString().replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const range = s.getRangeAt(0);
      const n = range.commonAncestorContainer;
      const target = n.nodeType === 1 ? n : n.parentElement;
      if (!target || target.closest(UI_SEL)) return null;
      const info = describeEl(target, 'text', text);
      info.rect = range.getBoundingClientRect();
      return info;
    }

    function placeFab(rect) {
      const w = 96;
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 8);
      const top = rect.top - 42 > 8 ? rect.top - 42 : Math.min(rect.bottom + 8, window.innerHeight - 40);
      fab.style.left = left + 'px';
      fab.style.top = top + 'px';
      fab.classList.add('show');
    }

    let timer = 0;
    document.addEventListener('selectionchange', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (boxOpen || pickMode) return;
        const sel = readSelection();
        if (sel) { saved = sel; placeFab(sel.rect); } else fab.classList.remove('show');
      }, 200);
    });
    document.addEventListener('scroll', () => { if (!boxOpen) fab.classList.remove('show'); }, { passive: true, capture: true });

    // 드래그로 선택한 직후의 클릭이 링크(목록 행 등)를 열지 않게 막음
    document.addEventListener('click', (e) => {
      const s = getSelection();
      if (!boxOpen && s && !s.isCollapsed && e.target.closest && e.target.closest('a') && !e.target.closest(UI_SEL)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // ---- 요청 입력창 ----
    function renderBox() {
      const short = saved.text.length > 120 ? saved.text.slice(0, 120) + '…' : saved.text;
      quote.classList.toggle('el', saved.kind === 'element');
      quote.textContent = saved.kind === 'element'
        ? '<' + saved.label + '>' + (short ? '  ' + short : '  (글자 없는 요소)')
        : short;
      note.textContent = saved.notion ? '⚠️ Notion에서 온 글일 수 있어요. 본문 수정은 Notion에서 해야 해요.' : '';
      up.disabled = isBoundary(saved.el.parentElement);
    }

    function openBox() {
      if (!saved) return;
      boxOpen = true;
      fab.classList.remove('show');
      renderBox();
      ta.classList.remove('err');
      box.classList.add('show');
      ta.focus();
    }
    function closeBox() {
      boxOpen = false;
      box.classList.remove('show');
      ta.value = '';
      hlEl = null;
      paintHl();
      const s = getSelection();
      if (s) s.removeAllRanges();
    }

    up.addEventListener('click', () => {
      const p = saved && saved.el.parentElement;
      if (isBoundary(p)) return;
      saved = describeEl(p, 'element');
      hlEl = p;
      paintHl();
      renderBox();
      ta.focus();
    });

    fab.addEventListener('mousedown', (e) => e.preventDefault()); // 선택 영역 유지
    fab.addEventListener('click', openBox);
    cancel.addEventListener('click', closeBox);
    box.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 사이트의 Esc(패널 닫기)와 충돌 방지
      if (e.key === 'Escape') closeBox();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    });

    function submit() {
      const request = ta.value.trim();
      if (!request || !saved) { ta.classList.add('err'); ta.focus(); return; }
      let url = buildIssueUrl(request, saved, MAX_TEXT, true);
      if (url.length > MAX_URL) url = buildIssueUrl(request, saved, 60, false); // 너무 길면 텍스트를 줄이고 HTML은 뺌
      window.open(url, '_blank', 'noopener');
      closeBox();
    }
    send.addEventListener('click', submit);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
