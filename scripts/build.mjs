// 정적 파일 → dist/ 복사 후, Notion 글이 있으면 글 페이지와 목록을 생성한다.
//   NOTION_TOKEN=secret_xxx NOTION_DATABASE_ID=xxxx node scripts/build.mjs
// 토큰이 없으면 placeholder 그대로 빌드한다.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchPosts, esc } from './notion.mjs';

const OUT = 'dist';
const ARROW = '<svg class="icon" viewBox="0 0 24 24"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';

const fill = (html, key, value) => html.replace(new RegExp(`<!--${key}-->[\\s\\S]*?<!--/${key}-->`), () => `<!--${key}-->${value}<!--/${key}-->`);
const toRoot = (html) => html.replace(/(href|src)="(?!https?:|#|mailto:|\.\.\/)([^"]+)"/g, '$1="../$2"'); // posts/ 하위용 상대경로

const rows = (posts, prefix = '') => posts.map((p) =>
  `\n        <a class="row" href="${prefix}posts/${encodeURIComponent(p.slug)}.html" data-panel><span class="title">${esc(p.title)}</span><span class="meta">${p.date}</span>${ARROW}</a>`).join('') + '\n      ';


// 배포마다 달라지는 값을 CSS/JS 주소와 <html data-build>에 넣어, 브라우저가 이전 파일(최대 10분 캐시)을 쓰지 않게 함.
// script.js는 이 값을 패널(iframe) 주소에도 붙인다.
const BUILD = Date.now().toString(36);
async function stampBuild(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets') await stampBuild(p); continue; }
    if (!e.name.endsWith('.html')) continue;
    let h = await readFile(p, 'utf8');
    h = h.replace(/(href|src)="((?:\.\.\/)?(?:style\.css|script\.js))"/g, `$1="$2?v=${BUILD}"`).replace('<html ', `<html data-build="${BUILD}" `);
    await writeFile(p, h);
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const f of await readdir('.')) {
  if (/\.(html|css|js)$/.test(f)) await cp(f, `${OUT}/${f}`);
}
await cp('assets', `${OUT}/assets`, { recursive: true });

const token = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;
if (!token || !databaseId) {
  console.warn('NOTION_TOKEN / NOTION_DATABASE_ID 없음 → placeholder로 빌드합니다.');
  await stampBuild(OUT);
  process.exit(0);
}

console.log('Notion에서 글을 가져오는 중...');
const all = await fetchPosts({ token, databaseId, outDir: OUT });
const posts = all.filter((p) => p.type === 'article');
const works = all.filter((p) => p.type === 'work');
console.log(`공개 글 ${posts.length}개, 프로젝트 ${works.length}개`);

// 상세 페이지: 글은 article.html, 프로젝트는 project.html 템플릿 사용
async function writePages(items, templateFile, dir, siteTitle, metaOf) {
  const template = await readFile(templateFile, 'utf8');
  await mkdir(`${OUT}/${dir}`, { recursive: true });
  for (const p of items) {
    let h = toRoot(template);
    h = h.replace(/<title>.*?<\/title>/, `<title>${esc(p.title)} | ${siteTitle}</title>`);
    if (p.summary) h = h.replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(p.summary)}"`);
    h = fill(h, 'title', esc(p.title));
    h = fill(h, 'meta', metaOf(p));
    h = fill(h, 'body', p.body);
    await writeFile(`${OUT}/${dir}/${p.slug}.html`, h);
  }
}
const tags = (p) => p.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('');
await writePages(posts, 'article.html', 'posts', '류서환', (p) => `<span>${p.date}</span>${tags(p)}<span>${p.minutes} min read</span>`);
await writePages(works, 'project.html', 'work', '류서환', (p) => `<span>${p.year}</span>${p.role ? `<span>${esc(p.role)}</span>` : ''}${tags(p)}`);

// 목록: 글 페이지=전체 글, 홈=최신 글 3개 + 전체 프로젝트
const emptyOf = (msg) => `\n        <p class="empty" style="padding:14px 0">${msg}</p>\n      `;
const workRows = (items) => items.map((p) =>
  `\n        <a class="row" href="work/${encodeURIComponent(p.slug)}.html" data-panel><span class="title">${esc(p.title)}${p.summary ? `<span class="desc">${esc(p.summary)}</span>` : ''}</span><span class="meta">${[p.role, p.year].filter(Boolean).map(esc).join(' · ')}</span>${ARROW}</a>`).join('') + '\n      ';

let h = await readFile(`${OUT}/writing.html`, 'utf8');
await writeFile(`${OUT}/writing.html`, fill(h, 'posts', posts.length ? rows(posts) : emptyOf('아직 글이 없습니다.')));
h = await readFile(`${OUT}/index.html`, 'utf8');
h = fill(h, 'posts', posts.length ? rows(posts.slice(0, 3)) : emptyOf('아직 글이 없습니다.'));
h = fill(h, 'works', works.length ? workRows(works) : emptyOf('아직 프로젝트가 없습니다.'));
await writeFile(`${OUT}/index.html`, h);
await stampBuild(OUT);
console.log('완료 → dist/');
