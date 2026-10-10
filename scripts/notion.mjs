// Notion API → HTML 변환. 외부 의존성 없음(Node 18+ 내장 fetch 사용).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = process.env.NOTION_API_BASE || 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

// 데이터베이스 속성 이름 (Notion에서 만든 이름과 맞춰야 함. 제목 속성은 타입으로 자동 탐지)
export const PROPS = { slug: 'Slug', date: 'Date', tags: 'Tags', published: 'Published', summary: 'Summary' };

async function api(token, route, body) {
  const res = await fetch(API + route, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${res.status} ${route}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function paginate(token, route, body) {
  const out = [];
  let cursor;
  do {
    const sep = body ? '' : (route.includes('?') ? '&' : '?') + (cursor ? `start_cursor=${cursor}&page_size=100` : 'page_size=100');
    const data = await api(token, route + sep, body ? { ...body, start_cursor: cursor, page_size: 100 } : undefined);
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

export const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (rt = []) => rt.map((t) => t.plain_text).join('');

function richText(rt = []) {
  return rt.map((t) => {
    let s = esc(t.plain_text).replace(/\n/g, '<br>');
    const a = t.annotations || {};
    if (a.code) s = `<code>${s}</code>`;
    if (a.bold) s = `<strong>${s}</strong>`;
    if (a.italic) s = `<em>${s}</em>`;
    if (a.strikethrough) s = `<s>${s}</s>`;
    if (a.underline) s = `<u>${s}</u>`;
    if (t.href) s = `<a href="${esc(t.href)}" target="_blank" rel="noopener">${s}</a>`;
    return s;
  }).join('');
}

// Notion 파일 URL은 약 1시간 후 만료되므로 빌드 시 내려받아 정적 자산으로 저장
async function saveImage(url, ctx) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const type = res.headers.get('content-type') || '';
    let ext = path.extname(new URL(url).pathname).toLowerCase();
    if (!/^\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext)) ext = '.' + (type.split('/')[1] || 'png').split(';')[0].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const name = `${++ctx.imageCount}${ext}`;
    const dir = path.join(ctx.outDir, 'assets', 'posts', ctx.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
    return `../assets/posts/${ctx.slug}/${name}`;
  } catch (e) {
    console.warn(`  ! image download failed (${e.message}), keeping remote URL`);
    return url;
  }
}

async function children(token, id) {
  const blocks = await paginate(token, `/blocks/${id}/children`);
  for (const b of blocks) if (b.has_children) b.children = await children(token, b.id);
  return blocks;
}

async function renderBlocks(blocks = [], ctx) {
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const t = b.type;
    const d = b[t] || {};
    const inner = async () => (b.children ? renderBlocks(b.children, ctx) : '');
    if (t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'to_do') {
      const tag = t === 'numbered_list_item' ? 'ol' : 'ul';
      let items = '';
      while (i < blocks.length && (blocks[i].type === t)) {
        const x = blocks[i];
        const box = t === 'to_do' ? (x.to_do.checked ? '☑ ' : '☐ ') : '';
        items += `<li${t === 'to_do' ? ' class="todo"' : ''}>${box}${richText(x[t].rich_text)}${x.children ? await renderBlocks(x.children, ctx) : ''}</li>`;
        i++;
      }
      i--;
      html += `<${tag}>${items}</${tag}>\n`;
      continue;
    }
    switch (t) {
      case 'paragraph': html += d.rich_text.length ? `<p>${richText(d.rich_text)}</p>\n` : ''; html += await inner(); break;
      case 'heading_1': case 'heading_2': html += `<h2>${richText(d.rich_text)}</h2>\n`; break; // 글 제목이 h1이므로 한 단계씩 내림
      case 'heading_3': html += `<h3>${richText(d.rich_text)}</h3>\n`; break;
      case 'quote': html += `<blockquote>${richText(d.rich_text)}${await inner()}</blockquote>\n`; break;
      case 'callout': html += `<div class="callout"><span>${esc(d.icon?.emoji || '')}</span><div>${richText(d.rich_text)}${await inner()}</div></div>\n`; break;
      case 'code': html += `<pre><code class="language-${esc(d.language)}">${esc(plain(d.rich_text))}</code></pre>\n`; break;
      case 'divider': html += '<hr>\n'; break;
      case 'toggle': html += `<details><summary>${richText(d.rich_text)}</summary>${await inner()}</details>\n`; break;
      case 'bookmark': case 'link_preview': html += `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a></p>\n`; break;
      case 'image': {
        const src = await saveImage(d.type === 'external' ? d.external.url : d.file.url, ctx);
        const cap = plain(d.caption);
        html += `<figure><img src="${esc(src)}" alt="${esc(cap)}" loading="lazy">${cap ? `<figcaption>${richText(d.caption)}</figcaption>` : ''}</figure>\n`;
        break;
      }
      default: console.warn(`  ! unsupported block type skipped: ${t}`);
    }
  }
  return html;
}

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (iso) => { const d = new Date(iso); return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`; };
const slugify = (s) => s.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

// 공개 글 목록 + 본문 HTML 가져오기
export async function fetchPosts({ token, databaseId, outDir }) {
  const pages = await paginate(token, `/databases/${databaseId}/query`, {
    filter: { property: PROPS.published, checkbox: { equals: true } },
    sorts: [{ property: PROPS.date, direction: 'descending' }],
  });
  const posts = [];
  const used = new Set();
  for (const p of pages) {
    const pr = p.properties;
    const titleProp = Object.values(pr).find((v) => v.type === 'title');
    const title = plain(titleProp?.title) || 'Untitled';
    let slug = slugify(plain(pr[PROPS.slug]?.rich_text)) || slugify(title) || p.id.replace(/-/g, '').slice(0, 8);
    if (used.has(slug)) slug += '-' + p.id.replace(/-/g, '').slice(0, 6);
    used.add(slug);
    const dateIso = pr[PROPS.date]?.date?.start || p.created_time;
    console.log(`- ${title} (${slug})`);
    const ctx = { slug, outDir, imageCount: 0 };
    const body = await renderBlocks(await children(token, p.id), ctx);
    const words = body.replace(/<[^>]+>/g, '').length;
    posts.push({
      title, slug, dateIso, date: fmtDate(dateIso),
      tags: (pr[PROPS.tags]?.multi_select || []).map((x) => x.name),
      summary: plain(pr[PROPS.summary]?.rich_text),
      minutes: Math.max(1, Math.round(words / 500)), // 한글 기준 대략 분당 500자
      body,
    });
  }
  return posts;
}
