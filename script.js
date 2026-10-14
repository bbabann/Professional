// embed 모드(패널 안에서 열린 페이지)면 내비/푸터를 숨김. 깜빡임 방지를 위해 <head>에서 즉시 실행
if (new URLSearchParams(location.search).has('embed')) document.documentElement.classList.add('embed');

// 제목 reveal은 '동작 줄이기' 설정이 꺼져 있고 IntersectionObserver를 쓸 수 있을 때만 켠다
const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window;
if (motionOK) document.documentElement.classList.add('js-motion');


// 제목 reveal: 제목은 마스크 안에서 올라오고, 날짜/첫 문단은 순서대로 페이드업
function initReveal() {
  if (!motionOK) return;
  const h1 = document.querySelector('.article-head h1');
  if (!h1) return;
  h1.innerHTML = '<span class="mask"><span class="rise">' + h1.innerHTML + '</span></span>';
  const targets = [h1, document.querySelector('.article-head .meta'), document.querySelector('.prose > *')].filter(Boolean);
  targets.forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--i', i); });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.25 });
  targets.forEach((el) => io.observe(el));
}

// 코멘트 팝업: 마우스를 따라다니는 툴팁(터치 기기는 탭하면 열고 닫음)
function initNotes() {
  const marks = document.querySelectorAll('mark.note');
  if (!marks.length) return;
  const tip = document.createElement('div');
  tip.className = 'note-tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let current = null;

  const place = (x, y) => {
    tip.dataset.x = x; tip.dataset.y = y;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + pad, top = y + pad;
    if (left + w > window.innerWidth - 8) left = x - w - pad; // 오른쪽이 넘치면 커서 왼쪽에
    if (top + h > window.innerHeight - 8) top = y - h - pad;  // 아래가 넘치면 커서 위에
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  };
  const show = (mark, x, y) => {
    current = mark;
    tip.textContent = '';
    if (mark.dataset.note) {
      const t = document.createElement('div');
      t.className = 'note-text';
      t.textContent = mark.dataset.note;
      tip.appendChild(t);
    }
    let imgs = [];
    try { imgs = JSON.parse(mark.dataset.imgs || '[]'); } catch (_) { /* 무시 */ }
    imgs.forEach((src) => {
      const w = document.createElement('div');
      w.className = 'note-img';
      const im = document.createElement('img');
      im.addEventListener('load', () => { if (current === mark && tip.dataset.x) place(+tip.dataset.x, +tip.dataset.y); });
      im.src = src;
      im.alt = '';
      w.appendChild(im);
      tip.appendChild(w);
    });
    place(x, y);
    tip.classList.add('show');
  };
  const hide = () => { current = null; tip.classList.remove('show'); };
  const touchOnly = window.matchMedia('(hover: none)');

  marks.forEach((m) => {
    m.addEventListener('mouseenter', (e) => { if (!touchOnly.matches) show(m, e.clientX, e.clientY); });
    m.addEventListener('mousemove', (e) => { if (current === m && !touchOnly.matches) place(e.clientX, e.clientY); });
    m.addEventListener('mouseleave', () => { if (current === m) hide(); });
    m.addEventListener('focus', () => { const r = m.getBoundingClientRect(); show(m, r.left, r.bottom); });
    m.addEventListener('blur', () => { if (current === m) hide(); });
    m.addEventListener('click', (e) => {
      if (!touchOnly.matches) return;
      if (current === m) hide(); else show(m, e.clientX, e.clientY);
      e.stopPropagation();
    });
  });
  document.addEventListener('click', hide);
  document.addEventListener('scroll', hide, { passive: true, capture: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

function initCompare(stage) {
  const fig = stage.parentElement;
  let dragging = false;
  const set = (pct) => {
    pct = Math.max(0, Math.min(100, pct));
    fig.style.setProperty('--pos', pct + '%');
    stage.setAttribute('aria-valuenow', Math.round(pct));
  };
  const fromEvent = (e) => { const r = stage.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
  stage.addEventListener('pointerdown', (e) => { dragging = true; stage.setPointerCapture(e.pointerId); fromEvent(e); });
  stage.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
  stage.addEventListener('pointerup', () => { dragging = false; });
  stage.addEventListener('pointercancel', () => { dragging = false; });
  stage.addEventListener('keydown', (e) => {
    const cur = Number(stage.getAttribute('aria-valuenow'));
    if (e.key === 'ArrowLeft') { set(cur - 5); e.preventDefault(); }
    if (e.key === 'ArrowRight') { set(cur + 5); e.preventDefault(); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.compare-stage').forEach(initCompare);
  initReveal();
  initNotes();
  if (document.documentElement.classList.contains('embed')) {
    // 패널 안: 맨 위 이미지 2장이 로드될 때까지 부모가 빈 화면을 유지하고, 준비되면 알려서 함께 페이드인되게 함 (이미지 로딩에 따른 레이아웃 변화 노출 방지)
    const imgs = [...document.querySelectorAll('.prose img')].slice(0, 2);
    const ready = (img) => new Promise((res) => {
      img.loading = 'eager';
      if (img.complete) return res();
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    });
    const timeout = new Promise((res) => setTimeout(res, 4000)); // 이미지가 끝내 안 오면 4초 뒤 그냥 표시
    Promise.race([Promise.all(imgs.map(ready)), timeout]).then(() => parent.postMessage({ embedReady: true }, '*'));
    return;
  }

  const X = '<svg class="icon" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML =
    '<button class="icon-btn panel-close" aria-label="닫기">' + X + '</button>' +
    '<iframe title="콘텐츠"></iframe>';
  document.body.appendChild(panel);

  const frame = panel.querySelector('iframe');
  let active = null;
  // 패널이 다 열리고(slid) 새 콘텐츠가 로드(loaded)된 뒤에만 내용을 페이드인 → 여는 동안 빈 화면 유지, 레이아웃 변화 노출 없음
  let loaded = true, slid = true, slideTimer = 0;
  const reveal = () => { if (loaded && slid) frame.classList.add('ready'); };
  // 정상 경로는 iframe이 보내는 embedReady 메시지. 메시지가 안 오는 경우(file:// 등)를 위해 load 후 일정 시간 뒤 폴백
  let fallback = 0;
  window.addEventListener('message', (e) => { if (e.source === frame.contentWindow && e.data && e.data.embedReady) { loaded = true; reveal(); } });
  frame.addEventListener('load', () => { clearTimeout(fallback); fallback = setTimeout(() => { loaded = true; reveal(); }, 5000); });
  panel.addEventListener('transitionend', (e) => { if (e.target === panel && e.propertyName === 'transform') { slid = true; reveal(); } });

  // iframe 이동이 브라우저 히스토리를 쌓으면 ✕(뒤로가기)가 패널 대신 iframe부터 되돌리므로, 항상 location.replace로 이동
  let current = '';
  function load(url) {
    // 히스토리 이동(뒤로가기)으로 iframe 내용이 바뀌어 있을 수 있으므로, 기억해 둔 값이 아니라 iframe의 실제 주소로 비교
    let actual = current;
    try { actual = frame.contentWindow.location.href; } catch (_) { /* file:// 등 접근 불가 시 기억한 값 사용 */ }
    if (actual === url) return; // 같은 항목이면 재로딩 없음
    current = url;
    // 이전 항목(닫혀 있는 동안 남겨 둔 내용)이 슬라이드인 중에 비치지 않도록 페이드아웃 없이 즉시 숨기고, 새 콘텐츠는 로드 후 페이드인
    loaded = false;
    frame.style.transition = 'none';
    frame.classList.remove('ready');
    void frame.offsetWidth; // 즉시 반영
    frame.style.transition = '';
    try { frame.contentWindow.location.replace(url); } catch (_) { frame.src = url; }
  }

  function open(row) {
    const href = row.getAttribute('href');
    const build = document.documentElement.dataset.build; // 배포마다 바뀌는 값 → iframe 문서도 새로 받게 함
    load(new URL(href + (href.includes('?') ? '&' : '?') + 'embed' + (build ? '&v=' + build : ''), location.href).href);
    if (active) active.removeAttribute('aria-current');
    active = row;
    row.setAttribute('aria-current', 'true');
    if (!document.body.classList.contains('split')) { // 닫혀 있다가 열림: 슬라이드가 끝날 때까지 내용 숨김(transitionend 누락 대비 타이머 병행)
      slid = false;
      clearTimeout(slideTimer);
      slideTimer = setTimeout(() => { slid = true; reveal(); }, 700);
    }
    if (!pushed) { history.pushState({ panel: true }, ''); pushed = true; }
    document.body.classList.add('split');
    panel.setAttribute('aria-hidden', 'false');
  }

  function hide() {
    document.body.classList.remove('split');
    panel.setAttribute('aria-hidden', 'true');
    if (active) active.removeAttribute('aria-current');
    active = null; // src는 유지: 닫히는 동안 내용이 비지 않고, 같은 항목을 다시 열면 재로딩 없음
  }
  // 패널을 열 때 히스토리를 한 칸만 쌓아 두어, 모바일의 뒤로가기/스와이프로도 패널이 닫히게 함.
  // ✕/Esc/같은 항목 재클릭은 히스토리를 건드리지 않고 패널만 닫는다 (남은 한 칸은 다음에 열 때 재사용).
  let pushed = false;
  if (history.state && history.state.panel) history.replaceState(null, ''); // 새로고침 등으로 남은 낡은 상태 정리
  function close() { hide(); }
  window.addEventListener('popstate', () => { pushed = false; if (document.body.classList.contains('split')) hide(); });

  document.addEventListener('click', (e) => {
    const row = e.target.closest('a.row[data-panel]');
    if (!row || e.metaKey || e.ctrlKey || e.shiftKey) return; // 새 탭으로 여는 클릭은 기본 동작
    e.preventDefault();
    if (row === active) close(); // 이미 선택된 항목을 다시 누르면 선택 해제(패널 닫기)
    else open(row);
  });
  panel.querySelector('.panel-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
});
