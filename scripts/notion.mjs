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

const isHl = (t) => t?.annotations?.color === 'yellow_background';
// 연속된 노란 배경 조각(굵게 등으로 쪼개진 것 포함)은 하나의 형광펜 구간으로 센다
const hlRuns = (rt = []) => rt.reduce((n, t, i) => n + (isHl(t) && !isHl(rt[i - 1]) ? 1 : 0), 0);

// notes: { list: 구간별 코멘트 문자열 배열, i: 다음 구간 번호 }
function richText(rt = [], notes = null) {
  let note = null;
  return rt.map((t, i) => {
    let s = esc(t.plain_text).replace(/\n/g, '<br>');
    const a = t.annotations || {};
    if (a.code) s = `<code>${s}</code>`;
    if (a.bold) s = `<strong>${s}</strong>`;
    if (a.italic) s = `<em>${s}</em>`;
    if (a.strikethrough) s = `<s>${s}</s>`;
    if (a.underline) s = `<u>${s}</u>`;
    if (t.href) s = `<a href="${esc(t.href)}" target="_blank" rel="noopener">${s}</a>`;
    if (isHl(t)) {
      if (!isHl(rt[i - 1])) note = notes ? (notes.list[notes.i++] || null) : null; // 새 구간 시작
      const has = note && (note.text || note.images?.length);
      s = has
        ? `<mark class="note" tabindex="0" data-note="${esc(note.text)}"${note.images?.length ? ` data-imgs="${esc(JSON.stringify(note.images))}"` : ''}>${s}</mark>`
        : `<mark class="hl">${s}</mark>`;
    }
    return s;
  }).join('');
}

// --- 코멘트: 형광펜(노란 배경) 구간이 있는 블록에서만 코멘트를 가져와 호버 팝업용으로 연결 ---
// Notion API는 코멘트가 달린 '문구'를 알려주지 않고 블록 단위로만 주므로, 문구 위치는 글에 칠한 노란 배경색으로 찾는다.
const commentsState = { disabled: false, loggedFields: false };

async function fetchBlockNotes(token, blockId, ctx) {
  if (commentsState.disabled) return [];
  let results;
  try {
    results = await paginate(token, `/comments?block_id=${blockId}`);
  } catch (e) {
    if (/ 40[13] /.test(e.message)) {
      commentsState.disabled = true;
      console.warn('  ! 코멘트를 읽을 수 없습니다 — Notion 통합의 "Read comments" 권한을 켜면 호버 팝업이 표시됩니다 (형광펜만 표시)');
    } else console.warn(`  ! 코멘트 조회 실패: ${e.message.slice(0, 140)}`);
    return [];
  }
  if (!commentsState.loggedFields && results[0]) {
    commentsState.loggedFields = true;
    console.log('  comment fields:', Object.keys(results[0]).join(','));
  }
  // 같은 토론(스레드)의 답글은 하나로 묶음. API는 오래된 순으로 반환
  const groups = new Map();
  for (const c of results) {
    const k = c.discussion_id || c.id;
    if (!groups.has(k)) groups.set(k, { texts: [], images: [] });
    const g = groups.get(k);
    const text = plain(c.rich_text);
    if (text) g.texts.push(text);
    // 코멘트에 첨부된 이미지: Notion 파일 URL은 곧 만료되므로 내려받아 저장
    if (c.attachments?.length && !commentsState.loggedAttach) { commentsState.loggedAttach = true; console.log('  attachments fields:', c.attachments.map((a) => `${a.category || '?'}{${Object.keys(a).join(',')}}`).join(' | ')); }
    for (const a of c.attachments || []) {
      const url = a.file?.url || a.external?.url;
      if (url && (a.category === 'image' || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url))) g.images.push(await saveImage(url, ctx));
    }
  }
  return [...groups.values()].map((g) => ({ text: g.texts.join('\n\n'), images: g.images }));
}

async function notesFor(b, ctx) {
  const arr = b[b.type]?.rich_text;
  if (!Array.isArray(arr)) return null;
  for (const t of arr) { const c = t.annotations?.color; if (c && c !== 'default') ctx.stats.colors.add(c); } // 진단: 사용된 색
  const k = hlRuns(arr);
  ctx.stats.hl += k;
  if (!k) return null;
  const groups = await fetchBlockNotes(ctx.token, b.id, ctx);
  // 진단: 형광펜 구간 수 / 코멘트 스레드 수 (문단 앞부분만 표시)
  const shape = groups.map((g) => `${g.text ? '텍스트' : ''}${g.text && g.images.length ? '+' : ''}${g.images.length ? `이미지${g.images.length}` : ''}` || '빈 코멘트').join(', ');
  console.log(`  · 형광펜 ${k}개 ↔ 코멘트 스레드 ${groups.length}개 [${shape}] — "${arr.map((t) => t.plain_text).join('').replace(/\s+/g, ' ').slice(0, 24)}…"`);
  if (k === 1) { // 형광펜이 하나면 그 블록의 코멘트를 모두 사용
    return { list: [{ text: groups.map((g) => g.text).filter(Boolean).join('\n\n'), images: groups.flatMap((g) => g.images) }], i: 0 };
  }
  if (groups.length !== k && groups.length) console.warn(`  ! 한 문단에 형광펜 ${k}개, 코멘트 ${groups.length}개 → 작성 순서대로(왼쪽부터) 연결합니다`);
  return { list: groups.slice(0, k), i: 0 };
}

// 이미지 파일 헤더에서 가로/세로 크기를 읽음(의존성 없이 PNG/JPEG/GIF/WebP). 로딩 전에 영역을 미리 잡는 스켈레톤용
function imgSize(b) {
  try {
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('latin1', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const f = b.toString('latin1', 12, 16);
      if (f === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (f === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
      if (f === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const m = b[o + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) };
        o += 2 + b.readUInt16BE(o + 2);
      }
    }
  } catch (_) { /* 크기를 모르면 속성 없이 출력 */ }
  return null;
}
const phWrap = (ctx, src, img) => { const d = ctx.sizes && ctx.sizes[src]; return d && d.w && d.h ? `<span class="ph" style="max-width:${d.w}px">${img}</span>` : img; };
const sizeAttr = (ctx, src) => { const d = ctx.sizes && ctx.sizes[src]; return d && d.w && d.h ? ` width="${d.w}" height="${d.h}"` : ''; };

// 모바일 용량 절감: 가로 1600px 상한 + WebP(움직이는 GIF는 애니메이션 WebP)로 변환. 결과가 더 크거나 sharp가 없으면 원본 유지
let sharpMod;
async function optimize(buf, ext) {
  if (!/^\.(png|jpe?g|gif|webp)$/.test(ext)) return null;
  try {
    sharpMod ??= (await import('sharp')).default;
    const out = await sharpMod(buf, { animated: true }).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer();
    return out.length < buf.length ? out : null;
  } catch (e) { sharpMod = sharpMod || null; return null; }
}

// Notion 파일 URL은 약 1시간 후 만료되므로 빌드 시 내려받아 정적 자산으로 저장
async function saveImage(url, ctx) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const type = res.headers.get('content-type') || '';
    let ext = path.extname(new URL(url).pathname).toLowerCase();
    if (!/^\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext)) ext = '.' + (type.split('/')[1] || 'png').split(';')[0].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    let name = `${++ctx.imageCount}${ext}`;
    const dir = path.join(ctx.outDir, 'assets', ctx.dir, ctx.slug);
    await mkdir(dir, { recursive: true });
    let buf = Buffer.from(await res.arrayBuffer());
    const small = await optimize(buf, ext);
    if (small) { console.log(`    · 이미지 최적화 ${name}: ${(buf.length / 1024) | 0}KB → ${(small.length / 1024) | 0}KB`); buf = small; name = name.replace(/\.\w+$/, '.webp'); }
    await writeFile(path.join(dir, name), buf);
    const src = `../assets/${ctx.dir}/${ctx.slug}/${name}`;
    (ctx.sizes ||= {})[src] = imgSize(buf);
    return src;
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
    const isListItem = t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'to_do';
    const notes = isListItem ? null : await notesFor(b, ctx); // 리스트 항목은 아래 반복문에서 항목별로 처리
    const inner = async () => (b.children ? renderBlocks(b.children, ctx) : '');
    if (t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'to_do') {
      const tag = t === 'numbered_list_item' ? 'ol' : 'ul';
      let items = '';
      while (i < blocks.length && (blocks[i].type === t)) {
        const x = blocks[i];
        const box = t === 'to_do' ? (x.to_do.checked ? '☑ ' : '☐ ') : '';
        items += `<li${t === 'to_do' ? ' class="todo"' : ''}>${box}${richText(x[t].rich_text, await notesFor(x, ctx))}${x.children ? await renderBlocks(x.children, ctx) : ''}</li>`;
        i++;
      }
      i--;
      html += `<${tag}>${items}</${tag}>\n`;
      continue;
    }
    switch (t) {
      case 'paragraph': html += d.rich_text.length ? `<p>${richText(d.rich_text, notes)}</p>\n` : ''; html += await inner(); break;
      case 'heading_1': case 'heading_2': html += `<h2>${richText(d.rich_text, notes)}</h2>\n`; break; // 글 제목이 h1이므로 한 단계씩 내림
      case 'heading_3': html += `<h3>${richText(d.rich_text, notes)}</h3>\n`; break;
      case 'quote': html += `<blockquote>${richText(d.rich_text, notes)}${await inner()}</blockquote>\n`; break;
      case 'callout': {
        // 앞뒤 줄바꿈은 제거하고, 텍스트도 자식 블록처럼 독립된 블록으로 렌더 (<br> 바로 뒤에 블록이 오는 구조를 피함)
        const text = richText(d.rich_text, notes).replace(/^(<br>)+|(<br>)+$/g, '');
        html += `<div class="callout"><span>${esc(d.icon?.emoji || '')}</span><div class="callout-body">${text ? `<div class="callout-text">${text}</div>` : ''}${await inner()}</div></div>\n`;
        break;
      }
      case 'code': html += `<pre><code class="language-${esc(d.language)}">${esc(plain(d.rich_text))}</code></pre>\n`; break;
      case 'column_list': html += `<div class="columns" style="--cols:${(b.children || []).length || 1}">${await inner()}</div>\n`; break;
      case 'column': html += `<div class="column">${await inner()}</div>`; break;
      case 'divider': html += '<hr>\n'; break;
      case 'toggle': html += `<details><summary>${richText(d.rich_text, notes)}</summary>${await inner()}</details>\n`; break;
      case 'bookmark': case 'link_preview': html += `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a></p>\n`; break;
      case 'image': {
        if (isCompareImage(b) && isCompareImage(blocks[i + 1])) {
          const [a, c] = [b, blocks[i + 1]];
          const labelA = plain(a.image.caption).replace(COMPARE, '') || 'As-is';
          const labelC = plain(c.image.caption).replace(COMPARE, '') || 'To-be';
          const [srcA, srcC] = [await saveImage(imageUrl(a.image), ctx), await saveImage(imageUrl(c.image), ctx)];
          html += `<figure class="compare" style="--pos:50%"><div class="compare-stage" tabindex="0" role="slider" aria-label="${esc(labelA)} / ${esc(labelC)} 비교" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">` +
            `<img class="compare-before" src="${esc(srcA)}"${sizeAttr(ctx, srcA)} alt="${esc(labelA)}" loading="lazy"><img class="compare-after" src="${esc(srcC)}" alt="${esc(labelC)}" loading="lazy">` +
            `<span class="compare-label compare-label-l">${esc(labelA)}</span><span class="compare-label compare-label-r">${esc(labelC)}</span><span class="compare-handle"></span></div></figure>\n`;
          i++; // 두 번째 이미지는 소비됨
          break;
        }
        const src = await saveImage(imageUrl(d), ctx);
        const cap = plain(d.caption).replace(COMPARE, '');
        html += `<figure>${phWrap(ctx, src, `<img src="${esc(src)}"${sizeAttr(ctx, src)} alt="${esc(cap)}" loading="lazy">`)}${cap ? `<figcaption>${richText(d.caption)}</figcaption>` : ''}</figure>\n`;
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
    const ctx = { token, slug, outDir, imageCount: 0, dir: type === 'work' ? 'work' : 'posts', stats: { hl: 0, colors: new Set() } };
    const body = await renderBlocks(await children(token, p.id), ctx);
    if (ctx.stats.hl || ctx.stats.colors.size) console.log(`  · 노란 배경 형광펜 ${ctx.stats.hl}개${ctx.stats.colors.size ? ` / 이 글에서 쓰인 색: ${[...ctx.stats.colors].join(', ')}` : ''}`);
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
