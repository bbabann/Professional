// 수정 요청 위젯 — script.js가 "편집 모드"일 때만 불러옵니다 (방문자에게는 로드되지 않음).
// 사용법: 텍스트를 드래그 → "✎ 수정 요청" → 요청 입력 → GitHub 이슈 작성 화면이 채워진 채로 열림 → Submit.
(() => {
  const REPO = 'bbabann/Professional';
  const LABEL = 'site-edit';       // 이슈에 붙는 라벨 (저장소에 없으면 GitHub가 무시함)
  const MAX_TEXT = 200;            // 이슈에 담을 선택 텍스트 최대 길이
  const MAX_URL = 7000;            // GitHub 새 이슈 URL 길이 안전선

  if (window.__editWidget) return;
  window.__editWidget = true;

  const CSS = `
    html.ew-on a, html.ew-on img { -webkit-user-drag: none; user-select: text; }
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
    .ew-box textarea { display: block; width: 100%; min-height: 84px; box-sizing: border-box; padding: 9px 10px;
      border: 1px solid #ddd; border-radius: 8px; font: inherit; color: inherit; background: #fff; resize: vertical; }
    .ew-box textarea:focus { outline: 2px solid #111; outline-offset: -1px; }
    .ew-box textarea.err { border-color: #dc2626; }
    .ew-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .ew-note { margin-right: auto; font-size: 12px; line-height: 1.4; color: #b45309; }
    .ew-btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #ddd; background: #fff; color: #111; font: inherit; cursor: pointer; }
    .ew-btn.primary { border-color: #111; background: #111; color: #fff; }
    .ew-pill { position: fixed; z-index: 2147482999; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 8px;
      padding: 6px 6px 6px 12px; border-radius: 999px; background: rgba(17,17,17,.88); color: #fff;
      font: 12px/1 system-ui, -apple-system, "Pretendard Variable", sans-serif; }
    .ew-pill button { padding: 5px 9px; border: 0; border-radius: 999px; background: rgba(255,255,255,.18); color: #fff; font: inherit; cursor: pointer; }
  `;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  // 선택 영역의 공통 부모 요소 → "section.hero > h1" 같은 CSS 경로 (Claude가 코드에서 위치를 찾는 단서)
  const SKIP_CLASS = new Set(['js', 'js-motion', 'in', 'rv', 'ready', 'open', 'loaded', 'embed', 'split', 'ew-on']);
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

  function buildIssueUrl(request, sel, textLimit) {
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
      '- 선택한 텍스트: > ' + text,
      '- 요소(CSS 경로): `' + sel.path + '`',
      '- 화면 너비: ' + window.innerWidth + 'px',
    ];
    if (sel.notion) lines.push('- ⚠️ Notion에서 가져온 영역일 수 있음: 글/프로젝트 내용 자체는 코드가 아니라 Notion에서 바꿔야 함');
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
    ta.placeholder = '어떻게 바꾸고 싶나요? 예) 이 제목을 더 크게, 색은 회색으로';
    const row = el('div', 'ew-row');
    const note = el('span', 'ew-note');
    const cancel = el('button', 'ew-btn', '취소');
    cancel.type = 'button';
    const send = el('button', 'ew-btn primary', 'GitHub로 보내기 ↗');
    send.type = 'button';
    row.append(note, cancel, send);
    box.append(quote, ta, row);
    document.body.append(fab, box);

    // 편집 모드 표시 + 끄기 (맨 위 창에서만)
    if (!document.documentElement.classList.contains('embed')) {
      const pill = el('div', 'ew-pill', '✎ 편집 모드');
      const off = el('button', '', '끄기');
      off.type = 'button';
      off.addEventListener('click', () => {
        try { localStorage.removeItem('edit-mode'); } catch (_) { /* 무시 */ }
        const u = new URL(location.href);
        u.searchParams.delete('edit');
        location.href = u.href;
      });
      pill.appendChild(off);
      document.body.appendChild(pill);
    }

    let saved = null;
    let boxOpen = false;

    function readSelection() {
      const s = getSelection();
      if (!s || s.isCollapsed || !s.rangeCount) return null;
      const text = s.toString().replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const range = s.getRangeAt(0);
      const n = range.commonAncestorContainer;
      const target = n.nodeType === 1 ? n : n.parentElement;
      if (!target || target.closest('.ew-box, .ew-fab, .ew-pill')) return null;
      return {
        text,
        path: cssPath(target),
        notion: !!target.closest('.prose, .article-head, .rows'),
        rect: range.getBoundingClientRect(),
      };
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
        if (boxOpen) return;
        const sel = readSelection();
        if (sel) { saved = sel; placeFab(sel.rect); } else fab.classList.remove('show');
      }, 200);
    });
    document.addEventListener('scroll', () => { if (!boxOpen) fab.classList.remove('show'); }, { passive: true, capture: true });

    // 드래그로 선택한 직후의 클릭이 링크(목록 행 등)를 열지 않게 막음
    document.addEventListener('click', (e) => {
      const s = getSelection();
      if (!boxOpen && s && !s.isCollapsed && e.target.closest && e.target.closest('a') && !e.target.closest('.ew-box, .ew-fab')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    function openBox() {
      if (!saved) return;
      boxOpen = true;
      fab.classList.remove('show');
      quote.textContent = saved.text.length > 120 ? saved.text.slice(0, 120) + '…' : saved.text;
      note.textContent = saved.notion ? '⚠️ Notion에서 온 글일 수 있어요. 본문 수정은 Notion에서 해야 해요.' : '';
      ta.classList.remove('err');
      box.classList.add('show');
      ta.focus();
    }
    function closeBox() {
      boxOpen = false;
      box.classList.remove('show');
      ta.value = '';
      const s = getSelection();
      if (s) s.removeAllRanges();
    }

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
      let url = buildIssueUrl(request, saved, MAX_TEXT);
      if (url.length > MAX_URL) url = buildIssueUrl(request, saved, 60); // 너무 길면 선택 텍스트를 줄임
      window.open(url, '_blank', 'noopener');
      closeBox();
    }
    send.addEventListener('click', submit);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
