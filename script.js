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
  if (document.documentElement.classList.contains('embed')) return;

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
  frame.addEventListener('load', () => frame.classList.add('ready'));

  function open(row) {
    const href = row.getAttribute('href');
    const next = href + (href.includes('?') ? '&' : '?') + 'embed';
    if (!frame.getAttribute('src') || !frame.src.endsWith(next)) {
      frame.classList.remove('ready'); // 새 콘텐츠는 로드 후 페이드인
      frame.src = next;
    }
    if (active) active.removeAttribute('aria-current');
    active = row;
    row.setAttribute('aria-current', 'true');
    if (!document.body.classList.contains('split')) history.pushState({ panel: true }, '');
    document.body.classList.add('split');
    panel.setAttribute('aria-hidden', 'false');
  }

  function hide() {
    document.body.classList.remove('split');
    panel.setAttribute('aria-hidden', 'true');
    if (active) active.removeAttribute('aria-current');
    active = null; // src는 유지: 닫히는 동안 내용이 비지 않고, 같은 항목을 다시 열면 재로딩 없음
  }
  // 패널을 열 때 히스토리 한 칸을 쌓아서, 모바일의 뒤로가기/스와이프로도 패널이 닫히게 함
  function close() {
    if (history.state && history.state.panel) history.back(); // popstate에서 hide()
    else hide();
  }
  window.addEventListener('popstate', () => { if (document.body.classList.contains('split')) hide(); });

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
