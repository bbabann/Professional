// embed 모드(패널 안에서 열린 페이지)면 내비/푸터를 숨김. 깜빡임 방지를 위해 <head>에서 즉시 실행
if (new URLSearchParams(location.search).has('embed')) document.documentElement.classList.add('embed');

document.addEventListener('DOMContentLoaded', () => {
  if (document.documentElement.classList.contains('embed')) return;

  const wide = window.matchMedia('(min-width: 900px)');
  const X = '<svg class="icon" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const OUT = '<svg class="icon" viewBox="0 0 24 24"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';

  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML =
    '<div class="panel-bar"><span class="panel-title"></span>' +
    '<a class="icon-btn panel-open" target="_blank" rel="noopener" aria-label="새 탭에서 열기">' + OUT + '</a>' +
    '<button class="icon-btn panel-close" aria-label="닫기">' + X + '</button></div>' +
    '<iframe title="콘텐츠"></iframe>';
  document.body.appendChild(panel);

  const frame = panel.querySelector('iframe');
  const title = panel.querySelector('.panel-title');
  const openLink = panel.querySelector('.panel-open');
  let active = null;
  frame.addEventListener('load', () => frame.classList.add('ready'));

  function open(row) {
    const href = row.getAttribute('href');
    const next = href + (href.includes('?') ? '&' : '?') + 'embed';
    if (!frame.getAttribute('src') || !frame.src.endsWith(next)) {
      frame.classList.remove('ready'); // 새 콘텐츠는 로드 후 페이드인
      frame.src = next;
    }
    openLink.href = href;
    title.textContent = row.querySelector('.title').firstChild.textContent.trim();
    if (active) active.removeAttribute('aria-current');
    active = row;
    row.setAttribute('aria-current', 'true');
    document.body.classList.add('split');
    panel.setAttribute('aria-hidden', 'false');
  }

  function close() {
    document.body.classList.remove('split');
    panel.setAttribute('aria-hidden', 'true');
    if (active) active.removeAttribute('aria-current');
    active = null; // src는 유지: 닫히는 동안 내용이 비지 않고, 같은 항목을 다시 열면 재로딩 없음
  }

  document.addEventListener('click', (e) => {
    const row = e.target.closest('a.row[data-panel]');
    if (!row || !wide.matches || e.metaKey || e.ctrlKey || e.shiftKey) return; // 좁은 화면/새 탭 클릭은 기본 이동
    e.preventDefault();
    open(row);
  });
  panel.querySelector('.panel-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wide.addEventListener('change', (e) => { if (!e.matches) close(); });
});
