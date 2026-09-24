// tidy.mjs — readable output. The generator writes markup as one long string; this lays it out so a diff reads:
// one block-level element per line, indented by depth with a tab a level, no line over WIDTH characters. It
// changes nothing a browser renders: a newline is inserted only where HTML already ignores whitespace —
// between block-level elements, between the items of a flex or grid container, at a space the source already
// had (a newline collapses to the same space), between two attributes, or inside an SVG path's data — and
// never inside an inline run, a <pre>, a <textarea> or a <script>. The pages rendered before and after this
// layout were compared element by element, box, colour and rendered text, when it was introduced.
export const WIDTH = 120;

// Elements whose surrounding whitespace never paints: they are display: block, table parts, list items or
// the sprite's symbols. A tag not in this list is left where it is — unless its parent is a flex or grid
// container, read from the stylesheet (layoutKeysFrom), because whitespace between flex or grid items is
// never rendered either. Whitespace between two inline elements of an inline run is the one place a newline
// would paint as a space, so it is never added there.
const BLOCK = new Set(('html head body meta link title script style main header footer nav aside section ' +
  'article div p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr td th caption colgroup col ' +
  'figure figcaption form fieldset legend hr blockquote details summary address symbol path defs ' +
  'circle rect line polyline polygon g option optgroup datalist').split(' '));
// elements the browser lays out as inline-block unless a rule says otherwise: whitespace just inside is safe
const DEFAULT_EDGES = new Set(['button', 'select']);
const VOID = new Set('meta link br hr img input col wbr source track area base embed param'.split(' '));
const RAW = new Set(['script', 'style', 'pre', 'textarea']);
// attributes whose value may wrap at a space: an accessible name is a flat string, path data is whitespace-
// tolerant. A title would show the break in its tooltip, so it is never wrapped.
const WRAPPABLE_ATTR = new Set(['aria-label', 'd', 'points', 'alt', 'content', 'style']);
const TAB = '\t';
const ROOM = 16;   // what an inline start tag leaves for a word and its end tag on the same line

// The flex and grid containers a stylesheet declares, as keys: 'btn' (a class, wherever it is), 'card-h.ct'
// (a class inside an ancestor with a class) or 'side-nav>a' (a tag inside an ancestor with a class). A class
// that any rule sets to another display is left out, so a container is only ever claimed when every rule agrees.
// Three kinds of container come back, each a set of keys. layout — flex or grid: whitespace between its items
// never paints, so a line may break anywhere between its children. block — display: block, list item, table
// or table cell: whitespace before and after it never paints, nor at the start and end of its content, so a
// line may break around it and just inside it. inlineBlock — inline-block: only the inside edges are safe. A
// fourth set, inline, holds every key some rule makes inline; it vetoes the others wherever it matches, so a
// class that is block in a table and inline in a card header is a container only in the table. `display:
// none` says nothing about whitespace and is ignored. A key is 'btn' (a class, wherever it is), 'card-h.ct'
// (a class inside an ancestor with a class), 'side-nav>a' (a tag inside an ancestor with a class) or 'td>small'
// (a tag inside a tag, matched against the parent alone).
export function layoutKeysFrom(css) {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const sets = { layout: new Set(), block: new Set(), inlineBlock: new Set(), inline: new Set() };
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const d = /display\s*:\s*([a-z-]+)/.exec(m[2]);
    if (!d || d[1] === 'none') continue;
    const kind = /^(?:inline-)?(?:flex|grid)$/.test(d[1]) ? 'layout'
      : /^(?:block|list-item|table-cell|table|flow-root)$/.test(d[1]) ? 'block'
      : d[1] === 'inline-block' ? 'inlineBlock' : 'inline';
    for (let sel of m[1].split(',')) {
      sel = sel.trim();
      if (!sel || sel.startsWith('@') || sel.includes('::')) continue;
      const parts = sel.split(/\s*[>+~]\s*|\s+/).map(p => p.replace(/:[a-z-]+(?:\([^)]*\))?/g, ''));
      const last = parts[parts.length - 1], prev = parts[parts.length - 2] || '';
      const cls = [...last.matchAll(/\.([\w-]+)/g)].map(x => x[1]);
      const tag = /^[a-z][a-z0-9]*/.exec(last)?.[0];
      const pc = [...prev.matchAll(/\.([\w-]+)/g)].map(x => x[1]);
      const ptag = /^[a-z][a-z0-9]*/.exec(prev)?.[0];
      let k = cls.length ? (parts.length > 1 && pc.length ? `${pc[pc.length - 1]}.${cls[cls.length - 1]}` : cls[cls.length - 1])
        : (tag && pc.length ? `${pc[pc.length - 1]}>${tag}` : tag && ptag && parts.length === 2 ? `${ptag}>${tag}` : null);
      // '.dsx-t td small' — a tag under a tag under a classed ancestor: 'dsx-t:td>small'
      if (!k && tag && ptag) for (let i = parts.length - 3; i >= 0; i--) { const cc = [...parts[i].matchAll(/\.([\w-]+)/g)].map(x => x[1]); if (cc.length) { k = `${cc[cc.length - 1]}:${ptag}>${tag}`; break; } }
      if (!k) continue;
      sets[kind].add(k);
    }
  }
  // a plain-class key some rule makes inline everywhere vetoes that class as a container everywhere
  for (const k of sets.inline) if (!/[.>]/.test(k)) for (const name of ['layout', 'block', 'inlineBlock']) sets[name].delete(k);
  return sets;
}

// Inside an <svg> whitespace between elements never paints either: nothing there is text.
const SVG_INNER = new Set(['svg', 'symbol', 'g', 'defs']);

export function tidyHtml(html, keys = { layout: new Set(), block: new Set(), inlineBlock: new Set(), inline: new Set() }) {
  const out = [];
  let depth = 0;
  let line = '';                 // the line being assembled
  const open = [];               // the open elements: { tag, classes, layout, edges }
  const claims = (set, el) => {  // does a key set claim this element?
    for (const c of el.classes) {
      if (set.has(c)) return true;
      for (const anc of open) for (const a of anc.classes) if (set.has(`${a}.${c}`)) return true;
    }
    for (const anc of open) for (const a of anc.classes) if (set.has(`${a}>${el.tag}`)) return true;
    const p = open[open.length - 1];
    if (p && set.has(`${p.tag}>${el.tag}`)) return true;
    if (p) for (const anc of open) for (const a of anc.classes) if (set.has(`${a}:${p.tag}>${el.tag}`)) return true;
    return false;
  };
  const has = (set, el) => claims(set, el) && !claims(keys.inline, el);
  const parent = () => open[open.length - 1];
  const parentIsLayout = () => open.length > 0 && parent().layout;
  let justOpened = false;        // nothing has followed the last start tag yet: its content's leading edge
  const width = (l) => l.length;   // a tab counts as one, which is what the readable gate measures too
  const flush = () => { if (line.trim()) out.push(...reflow(line.replace(/\s+$/, ''))); line = ''; };
  // a line over the width breaks at its last space outside a tag before the width — a space the source had, in
  // text, so a newline there renders the same — and the rest continues one level in
  const reflow = (l) => {
    const rows = [];
    let cur = l;
    while (width(cur) > WIDTH) {
      let inTag = false, q = null, at = -1;
      const lead = /^\t*/.exec(cur)[0].length;
      for (let i = 0; i < Math.min(cur.length, WIDTH); i++) {
        const ch = cur[i];
        if (inTag) { if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') inTag = false; continue; }
        if (ch === '<') { inTag = true; continue; }
        if (ch === ' ' && i > lead) at = i;
      }
      if (at < 0) break;
      rows.push(cur.slice(0, at).replace(/\s+$/, ''));
      cur = TAB.repeat(lead + 1) + cur.slice(at + 1);
    }
    rows.push(cur);
    return rows;
  };
  const indent = () => TAB.repeat(Math.max(0, depth));
  const startLine = () => { flush(); line = indent(); };
  const continueLine = () => { flush(); line = indent() + TAB; };
  // the line ends in a space the source had: that space may be the newline instead
  const breakAtSpace = () => {
    if (/ $/.test(line) && line.trim()) { line = line.replace(/ +$/, ''); continueLine(); return true; }
    return false;
  };
  // running text wraps at its own spaces
  const text = (s) => {
    const words = s.split(' ');
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (i && line.trim() && width(line) + 1 + w.length > WIDTH) { continueLine(); line += w; continue; }
      if (!i && w && width(line) + w.length > WIDTH) breakAtSpace();
      line += (i ? ' ' : '') + w;
    }
  };
  // a start tag, broken between attributes when it would run past the width; an inline start tag also wants
  // room for a word after it, so that the word and its end tag do not run past on their own
  const tag = (raw, room = 0) => {
    if (width(line) + raw.length + room <= WIDTH) { line += raw; return; }
    if (breakAtSpace() && width(line) + raw.length + room <= WIDTH) { line += raw; return; }
    const m = /^<([a-zA-Z][\w:-]*)([\s\S]*?)(\/?)>$/.exec(raw);
    if (!m) { line += raw; return; }
    const attrs = [...m[2].matchAll(/\s+([^\s=]+)(?:=("[^"]*"|'[^']*'|[^\s"'>]+))?/g)];
    if (attrs.length < 2 && width(line) + raw.length <= WIDTH) { line += raw; return; }   // nothing to break between
    line += `<${m[1]}`;
    const hang = indent() + TAB + TAB;
    for (const a of attrs) {
      const piece = a[2] === undefined ? a[1] : `${a[1]}=${a[2]}`;
      const last = a === attrs[attrs.length - 1];
      if (width(line) + 1 + piece.length + 2 + (last ? room : 0) > WIDTH) { flush(); line = hang; }
      const name = a[1], val = a[2];
      if (val && WRAPPABLE_ATTR.has(name) && width(line) + 1 + piece.length + 2 + (last ? room : 0) > WIDTH) {
        const q = val[0], inner = val.slice(1, -1);       // wrap inside the value at its spaces (a style's semicolons)
        line += ` ${name}=${q}`;
        const words = name === 'style' ? inner.split(/;\s*/).map((w, i, a) => w + (i < a.length - 1 ? ';' : '')) : inner.split(' ');
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          const tail = i === words.length - 1 ? 2 + room : 0;   // the closing quote and bracket, and room after
          if (i && width(line) + 1 + w.length + tail > WIDTH) { flush(); line = hang + TAB + w; continue; }
          line += (i ? ' ' : '') + w;
        }
        line += q;
      } else line += ' ' + piece;
    }
    line += `${m[3]}>`;
  };

  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g;
  let m, raw = null;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (raw) {                               // inside <script>, <style>, <pre>, <textarea>: verbatim
      if (tok.toLowerCase() === `</${raw}>`) { line += tok; raw = null; startLine(); }
      else line += tok;
      continue;
    }
    if (tok[0] !== '<') {                    // text
      const t = tok.replace(/[ \t]*\n[ \t]*/g, ' ');
      if (!t.trim()) {                       // whitespace between elements: a space, or a newline when the line is long
        if (line.trim()) { if (width(line) > WIDTH - 40) startLine(); else line += ' '; }
        continue;
      }
      // text is an item of a flex parent, or the leading edge of a block one: either may start a line
      if (line.trim() && width(line) + t.length > WIDTH && (parentIsLayout() || (justOpened && parent()?.edges))) continueLine();
      justOpened = false;
      text(t);
      continue;
    }
    if (tok.startsWith('<!--')) { startLine(); line += tok; startLine(); continue; }
    if (tok.startsWith('<!DOCTYPE')) { line += tok; startLine(); continue; }
    const close = tok[1] === '/';
    const name = /^<\/?([a-zA-Z][\w:-]*)/.exec(tok)[1].toLowerCase();
    if (close) {
      const el = open.pop();
      justOpened = false;
      const block = BLOCK.has(name) || (el && el.block);
      if (block) depth--;
      if (block && line.trim() && width(line) + tok.length > WIDTH) startLine();
      // trailing whitespace inside a flex item, a block container or an svg never paints: the end tag may start a line
      else if (!block && el && line.trim() && width(line) + tok.length + ROOM > WIDTH && (parentIsLayout() || el.edges || el.layout || SVG_INNER.has(el.tag))) continueLine();
      line += tok;
      if (block) startLine();
      else if (el && parentIsLayout() && width(line) > WIDTH - 40) startLine();
      continue;
    }
    const el = { tag: name, classes: [...tok.matchAll(/class="([^"]*)"/g)].flatMap(x => x[1].split(/\s+/)).filter(Boolean) };
    el.layout = has(keys.layout, el) || SVG_INNER.has(name);
    el.block = !el.layout && (BLOCK.has(name) || has(keys.block, el));
    el.edges = el.block || (!el.layout && (has(keys.inlineBlock, el) || (DEFAULT_EDGES.has(name) && !claims(keys.inline, el))));
    const block = BLOCK.has(name);
    const voided = VOID.has(name) || tok.endsWith('/>');
    if (block || el.block) {
      if (line.trim()) startLine();
      tag(tok);
      if (RAW.has(name)) raw = name; else if (!voided) { depth++; open.push(el); justOpened = true; }
      if (voided) startLine();
      continue;
    }
    // an inline element may start a line as an item of a flex parent, or as the first thing inside a block one
    if (line.trim() && width(line) + tok.length + ROOM > WIDTH && (parentIsLayout() || (justOpened && parent()?.edges))) continueLine();
    tag(tok, voided ? 0 : ROOM);
    justOpened = !voided;
    if (RAW.has(name)) raw = name; else if (!voided) open.push(el);
  }
  flush();
  return out.join('\n') + '\n';
}

// CSS: a rule that fits stays on one line; a long one opens up to one declaration per line, and a long
// declaration wraps its value after a comma or at a space outside quotes and parentheses. Whitespace outside
// strings is insignificant to CSS, so the sheet means the same thing either way.
export function tidyCss(css) {
  const out = [];
  for (const ln of css.split('\n')) {
    if (ln.length <= WIDTH) { out.push(ln); continue; }
    if (/^\s*\/\*/.test(ln)) { out.push(...wrapComment(ln)); continue; }
    out.push(...expand(ln, ''));
  }
  return out.join('\n') + '\n';
}
// a long comment line wraps at its spaces, each continuation indented under the text
function wrapComment(ln) {
  const pad = /^\s*/.exec(ln)[0] + '   ';
  const rows = []; let row = '';
  for (const w of ln.trim().split(' ')) {
    if (row && (row + ' ' + w).length > WIDTH) { rows.push(row); row = pad + w; }
    else row += (row ? ' ' : /^\s*/.exec(ln)[0]) + w;
  }
  if (row) rows.push(row);
  return rows;
}
// a selector list breaks after a top-level comma when it would not fit before its brace
function selectorLines(sel, pad) {
  if ((pad + sel + ' {').length <= WIDTH) return [pad + sel + ' {'];
  let parts = splitTop(sel, ',').map(p => p.trim()).filter(Boolean);
  if (parts.some(p => (pad + p + ' {').length > WIDTH)) parts = sel.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  const rows = []; let row = pad;
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i] + (i < parts.length - 1 ? ',' : ' {');
    if (row.trim() && (row + ' ' + piece).length > WIDTH) { rows.push(row); row = pad + piece; }
    else row += (row.trim() ? ' ' : '') + piece;
  }
  rows.push(row);
  return rows;
}
function expand(ln, pad) {
  const res = [];
  let i = 0, cur = '';
  const comment = (s, p) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => { res.push(p + c.trim()); return ''; });
  const emitDecls = (body, p) => {
    body = comment(body, p);                  // a comment among the declarations keeps a line of its own
    const parts = splitTop(body, ';').map(s => s.trim()).filter(Boolean);
    const one = p + parts.join('; ') + (parts.length ? ';' : '');
    if (one.length <= WIDTH) { if (parts.length) res.push(one); return; }
    for (const part of parts) {
      if ((p + part).length + 1 <= WIDTH) { res.push(p + part + ';'); continue; }
      const at = part.indexOf(':'); const name = part.slice(0, at + 1); const val = part.slice(at + 1).trim();
      let row = p + name;
      for (const piece of splitValue(val)) {
        const fits = (r, x) => (r + ' ' + x).length + 1 <= WIDTH;
        if (fits(row, piece)) { row += ' ' + piece; continue; }
        if (row.trim() !== name) { res.push(row); row = p + ' '; }
        if (fits(row, piece)) { row += ' ' + piece; continue; }
        // a piece too long for a row of its own splits after its inner commas
        for (const bit of piece.split(/,\s*/).map((b, i, a) => b + (i < a.length - 1 ? ',' : ''))) {
          if (!fits(row, bit) && row.trim() !== name && row.trim() !== '') { res.push(row); row = p + ' '; }
          row += ' ' + bit;
        }
      }
      res.push(row + ';');
    }
  };
  while (i < ln.length) {
    const ch = ln[i];
    if (ch === '{') {
      const sel = comment(cur, pad).trim(); cur = '';   // a comment before the selector is a line of its own
      const end = matchBrace(ln, i);
      const body = ln.slice(i + 1, end);
      const whole = `${pad}${sel} { ${body.trim()} }`;
      if (whole.length <= WIDTH && !body.includes('{')) { res.push(whole); i = end + 1; continue; }
      res.push(...selectorLines(sel, pad));
      if (body.includes('{')) res.push(...expand(body.trim(), pad + '  '));
      else emitDecls(body, pad + '  ');
      res.push(`${pad}}`);
      i = end + 1;
      continue;
    }
    cur += ch; i++;
  }
  if (cur.trim()) { if (/^\s*\/\*[\s\S]*\*\/\s*$/.test(cur)) res.push(pad + cur.trim()); else emitDecls(cur, pad); }
  return res;
}
// a value's pieces: after each top-level comma, then at spaces outside quotes and parentheses, then after the
// commas inside a long function such as linear()
function splitValue(v) {
  const out = [];
  for (const top of splitTop(v, ',')) {
    const t = top.trim(); if (!t) continue;
    const words = wordsOf(t);
    for (let i = 0; i < words.length; i++) {
      const w = words[i] + (i === words.length - 1 ? ',' : '');
      out.push(w);
    }
  }
  if (out.length) out[out.length - 1] = out[out.length - 1].replace(/,$/, '');
  return out;
}
function wordsOf(t) {
  const out = []; let cur = '', d = 0, q = null;
  for (const ch of t) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') d++; if (ch === ')') d--;
    if (/\s/.test(ch) && !d) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function matchBrace(s, at) { let d = 0; for (let i = at; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (!d) return i; } } return s.length; }
function splitTop(s, sep) { const out = []; let d = 0, cur = '', q = null; for (const ch of s) { if (q) { cur += ch; if (ch === q) q = null; continue; } if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; } if (ch === '(') d++; if (ch === ')') d--; if (ch === sep && !d) { out.push(cur); cur = ''; continue; } cur += ch; } if (cur.trim()) out.push(cur); return out; }
