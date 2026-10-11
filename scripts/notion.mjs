// Notion API → HTML 변환. 외부 의존성 없음(Node 18+ 내장 fetch 사용).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = process.env.NOTION_API_BASE || 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

// 데이터베이스 속성 이름 (Notion에서 만든 이름과 맞춰야 함. 제목 속성은 타입으로 자동 탐지)
export const PROPS = { slug: 'Slug', date: 'Date', tags: 'Tags', published: 'Published', summary: 'Summary', type: 'Type', role: 'Role' };

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
    const dir = path.join(ctx.outDir, 'assets', ctx.dir, ctx.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
    return `../assets/${ctx.dir}/${ctx.slug}/${name}`;
  } catch (e) {
    console.warn(`  ! image download failed (${e.message}), keeping remote URL`);
    return url;
  }
}


// 임베드 URL → iframe 주소 (Figma/YouTube/Vimeo는 임베드용 주소로 변환, 그 외 https는 그대로)
function embedSrc(raw = '') {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'figma.com') return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(raw)}`;
  if (host === 'youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.split('/').pop();
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (host === 'vimeo.com') return `https://player.vimeo.com/video/${encodeURIComponent(u.pathname.split('/').pop())}`;
  return raw;
}
const embedHtml = (src, caption) =>
  `<figure><iframe class="embed-frame" src="${esc(src)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>\n`;

// 캡션이 '@compare'로 시작하는 연속된 이미지 2장 → Before/After 슬라이더
const COMPARE = /^@compare\b\s*/i;
const isCompareImage = (b) => b?.type === 'image' && COMPARE.test(plain(b.image.caption));
const imageUrl = (d) => (d.type === 'external' ? d.external.url : d.file.url);

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
      case 'column_list': html += `<div class="columns" style="--cols:${(b.children || []).length || 1}">${await inner()}</div>\n`; break;
      case 'column': html += `<div class="column">${await inner()}</div>`; break;
      case 'divider': html += '<hr>\n'; break;
      case 'toggle': html += `<details><summary>${richText(d.rich_text)}</summary>${await inner()}</details>\n`; break;
      case 'bookmark': case 'link_preview': html += `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a></p>\n`; break;
      case 'image': {
        if (isCompareImage(b) && isCompareImage(blocks[i + 1])) {
          const [a, c] = [b, blocks[i + 1]];
          const labelA = plain(a.image.caption).replace(COMPARE, '') || 'As-is';
          const labelC = plain(c.image.caption).replace(COMPARE, '') || 'To-be';
          const [srcA, srcC] = [await saveImage(imageUrl(a.image), ctx), await saveImage(imageUrl(c.image), ctx)];
          html += `<figure class="compare" style="--pos:50%"><div class="compare-stage" tabindex="0" role="slider" aria-label="${esc(labelA)} / ${esc(labelC)} 비교" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">` +
            `<img class="compare-before" src="${esc(srcA)}" alt="${esc(labelA)}" loading="lazy"><img class="compare-after" src="${esc(srcC)}" alt="${esc(labelC)}" loading="lazy">` +
            `<span class="compare-label compare-label-l">${esc(labelA)}</span><span class="compare-label compare-label-r">${esc(labelC)}</span><span class="compare-handle"></span></div></figure>\n`;
          i++; // 두 번째 이미지는 소비됨
          break;
        }
        const src = await saveImage(imageUrl(d), ctx);
        const cap = plain(d.caption).replace(COMPARE, '');
        html += `<figure><img src="${esc(src)}" alt="${esc(cap)}" loading="lazy">${cap ? `<figcaption>${richText(d.caption)}</figcaption>` : ''}</figure>\n`;
        break;
      }
      case 'embed': case 'video': {
        const url = t === 'video' ? (d.type === 'external' ? d.external.url : null) : d.url;
        const src = embedSrc(url);
        if (src) html += embedHtml(src, plain(d.caption));
        else console.warn(`  ! ${t} skipped (https 외부 링크만 지원): ${url || 'file'}`);
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
    // Type 속성이 'Work'면 프로젝트, 비어 있거나 그 외는 글(article)
    const type = (pr[PROPS.type]?.select?.name || '').toLowerCase() === 'work' ? 'work' : 'article';
    console.log(`- [${type}] ${title} (${slug})`);
    const ctx = { slug, outDir, imageCount: 0, dir: type === 'work' ? 'work' : 'posts' };
    const body = await renderBlocks(await children(token, p.id), ctx);
    const words = body.replace(/<[^>]+>/g, '').length;
    posts.push({
      type, title, slug, dateIso, date: fmtDate(dateIso), year: String(new Date(dateIso).getUTCFullYear()),
      role: plain(pr[PROPS.role]?.rich_text),
      tags: (pr[PROPS.tags]?.multi_select || []).map((x) => x.name),
      summary: plain(pr[PROPS.summary]?.rich_text),
      minutes: Math.max(1, Math.round(words / 500)), // 한글 기준 대략 분당 500자
      body,
    });
  }
  return posts;
}
