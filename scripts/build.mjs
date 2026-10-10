// 정적 파일 → dist/ 복사 후, Notion 글이 있으면 글 페이지와 목록을 생성한다.
//   NOTION_TOKEN=secret_xxx NOTION_DATABASE_ID=xxxx node scripts/build.mjs
// 토큰이 없으면 placeholder 그대로 빌드한다.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fetchPosts, esc } from './notion.mjs';

const OUT = 'dist';
const ARROW = '<svg class="icon" viewBox="0 0 24 24"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';

const fill = (html, key, value) => html.replace(new RegExp(`<!--${key}-->[\\s\\S]*?<!--/${key}-->`), () => `<!--${key}-->${value}<!--/${key}-->`);
const toRoot = (html) => html.replace(/(href|src)="(?!https?:|#|mailto:|\.\.\/)([^"]+)"/g, '$1="../$2"'); // posts/ 하위용 상대경로

const rows = (posts, prefix = '') => posts.map((p) =>
  `\n        <a class="row" href="${prefix}posts/${encodeURIComponent(p.slug)}.html" data-panel><span class="title">${esc(p.title)}</span><span class="meta">${p.date}</span>${ARROW}</a>`).join('') + '\n      ';

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
  process.exit(0);
}

console.log('Notion에서 글을 가져오는 중...');
const posts = await fetchPosts({ token, databaseId, outDir: OUT });
console.log(`공개 글 ${posts.length}개`);

// 글 상세 페이지
const template = await readFile('article.html', 'utf8');
await mkdir(`${OUT}/posts`, { recursive: true });
for (const p of posts) {
  let h = toRoot(template);
  h = h.replace(/<title>.*?<\/title>/, `<title>${esc(p.title)} | 류서환</title>`);
  if (p.summary) h = h.replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(p.summary)}"`);
  h = fill(h, 'title', esc(p.title));
  h = fill(h, 'meta', `<span>${p.date}</span>${p.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}<span>${p.minutes} min read</span>`);
  h = fill(h, 'body', p.body);
  await writeFile(`${OUT}/posts/${p.slug}.html`, h);
}

// 목록 (글 페이지: 전체 / 홈: 최신 3개). 글이 하나도 없으면 안내 문구
const empty = '\n        <p class="empty" style="padding:14px 0">아직 글이 없습니다.</p>\n      ';
for (const [file, list] of [['writing.html', posts], ['index.html', posts.slice(0, 3)]]) {
  const h = await readFile(`${OUT}/${file}`, 'utf8');
  await writeFile(`${OUT}/${file}`, fill(h, 'posts', list.length ? rows(list) : empty));
}
console.log('완료 → dist/');
