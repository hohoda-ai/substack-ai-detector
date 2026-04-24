// Locate Substack note cards in the live DOM and pull out only the
// author-written body text — strip headers, Subscribe / Follow buttons,
// link-card previews, action bars, etc.

export interface NoteHandle {
  root: HTMLElement;
  actionBar: HTMLElement;
  /** Cleaned author-written text. May be short / empty for image notes. */
  text: string;
  /** True if Substack collapsed the body (a "See more" button is present). */
  truncated: boolean;
  id: string;
}

const NOTE_ROOT_SELECTORS = [
  '[data-testid="note"]',
  '[data-component-name="NoteItem"]',
  'div.reaction-web-root',
  'div[class*="pencraft"][class*="reaction-web-root"]',
  'div[class*="note-ui"]',
  'article[class*="note"]',
];

function textOf(el: Element): string {
  return (
    (el.getAttribute('aria-label') || '') +
    ' ' +
    (el.getAttribute('title') || '') +
    ' ' +
    (el.textContent || '')
  ).toLowerCase();
}

function isLikeButton(el: Element): boolean {
  return /\b(like|heart|reaction)\b/.test(textOf(el));
}
function isReplyButton(el: Element): boolean {
  return /\b(reply|comment)\b/.test(textOf(el));
}
function isRestackButton(el: Element): boolean {
  return /\b(restack|repost|share)\b/.test(textOf(el));
}

function insideComposer(el: Element): boolean {
  return !!el.closest(
    'form, textarea, [contenteditable="true"], [role="textbox"]'
  );
}

function findNoteRoot(actionBar: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = actionBar;
  for (let i = 0; i < 8 && el; i++) {
    const parent: HTMLElement | null = el.parentElement;
    if (!parent) break;
    if (parent.tagName === 'MAIN' || parent.tagName === 'BODY') break;

    const txt = (parent.innerText || '').trim();
    const extraBars = parent.querySelectorAll(
      'button[aria-label*="Like" i], button[aria-label*="Reply" i]'
    );
    if (txt.length > 60 && extraBars.length < 8) {
      const hasBody = Array.from(parent.children).some(
        (c) => c !== el && (c as HTMLElement).innerText?.trim().length > 20
      );
      if (hasBody) return parent;
    }
    el = parent;
  }
  return null;
}

function findActionBars(): HTMLElement[] {
  const bars = new Set<HTMLElement>();
  const clickable = document.querySelectorAll<HTMLElement>(
    'button, a[role="button"]'
  );

  for (const btn of clickable) {
    if (insideComposer(btn)) continue;
    if (!(isLikeButton(btn) || isReplyButton(btn) || isRestackButton(btn))) {
      continue;
    }

    let p: HTMLElement | null = btn.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      const kids = p.querySelectorAll<HTMLElement>('button, a[role="button"]');
      let like = false;
      let reply = false;
      for (const k of kids) {
        if (insideComposer(k)) continue;
        if (!like && isLikeButton(k)) like = true;
        if (!reply && isReplyButton(k)) reply = true;
      }
      if (like && reply) {
        bars.add(p);
        break;
      }
      p = p.parentElement;
    }
  }
  return [...bars];
}

/**
 * Extract only the note author's actual body text.
 *
 * Fast path: Substack wraps note bodies in a `.ProseMirror` editor div
 * that contains ONLY the typed-in content — no header, no link card,
 * no action bar. When present we just take its innerText.
 *
 * Fallback path: a layered cleanup that strips
 *   - the action bar (Like / Reply / Restack icons + counts)
 *   - the header strip (avatar + author name + time + Subscribe / "..." / X)
 *   - link-card previews to other Substack articles
 *   - "X liked" / "X restacked" interaction breadcrumbs
 *   - quoted / restacked note cards
 *
 * The fallback marks elements on the live DOM with a temporary attribute
 * so `cloneNode` carries the marks across, then strips the marked nodes
 * from the clone (live DOM stays untouched).
 */
function extractCleanText(root: HTMLElement, actionBar: HTMLElement): string {
  // ── Fast path ────────────────────────────────────────────────────────
  // The first ProseMirror inside `root` is the outer note's body. Any
  // ProseMirror nested deeper belongs to a quoted/restacked note and is
  // ignored.
  const bodies = root.querySelectorAll<HTMLElement>(
    '[class*="ProseMirror"], [data-testid="note-body"]'
  );
  if (bodies.length > 0) {
    const body = bodies[0];
    const text = body.innerText.replace(/\s+/g, ' ').trim();
    if (text.length >= 20) return text;
  }

  // ── Fallback path ────────────────────────────────────────────────────
  const SKIP_ATTR = 'data-said-skip';
  const marked: HTMLElement[] = [];

  function mark(el: Element | null | undefined) {
    if (!el || !(el instanceof HTMLElement)) return;
    if (el.hasAttribute(SKIP_ATTR)) return;
    el.setAttribute(SKIP_ATTR, '1');
    marked.push(el);
  }

  try {
    // 1) action bar
    mark(actionBar);

    // 2) header strip: the row at the top of a note containing the
    //    author's avatar + name + timestamp + (optional) Subscribe / X.
    //    Two passes — Subscribe-button heuristic is most precise, but the
    //    button is hidden for authors you already follow, so we fall back
    //    to "smallest container around the first avatar-sized <img>".
    let headerMarked = false;

    // 2a) Subscribe / Follow button anchor.
    root.querySelectorAll('button, a').forEach((btn) => {
      if (headerMarked) return;
      const t = (btn.textContent || '').trim().toLowerCase();
      if (t !== 'subscribe' && t !== 'follow' && t !== 'follow back') return;
      let p: HTMLElement | null = btn.parentElement;
      for (let i = 0; i < 6 && p && p !== root; i++) {
        const txt = p.innerText?.trim() || '';
        if (txt.length < 200 && p.querySelector('img,svg,a')) {
          mark(p);
          headerMarked = true;
          return;
        }
        p = p.parentElement;
      }
    });

    // 2b) Avatar fallback. Use the FIRST avatar-sized <img> in document
    //     order — that's always the outer header. Any subsequent small
    //     <img>s belong to quoted/restacked notes (handled in step 6).
    if (!headerMarked) {
      const firstAvatar = Array.from(
        root.querySelectorAll<HTMLImageElement>('img')
      ).find((img) => {
        const r = img.getBoundingClientRect();
        const w =
          r.width || parseInt(img.getAttribute('width') || '0', 10) || 0;
        return w > 0 && w < 96;
      });
      if (firstAvatar) {
        let p: HTMLElement | null = firstAvatar.parentElement;
        for (let i = 0; i < 6 && p && p !== root; i++) {
          const txt = p.innerText?.trim() || '';
          if (txt.length < 200) {
            mark(p);
            headerMarked = true;
            break;
          }
          p = p.parentElement;
        }
      }
    }

    // 2c) Profile-link fallback. Some Substack themes render the avatar
    //     as a CSS background instead of <img>, so step 2b returns
    //     nothing. The <a href="/@username"> author link, however, is
    //     always in the header — climb up from there.
    if (!headerMarked) {
      const profileLink = root.querySelector<HTMLAnchorElement>(
        'a[href^="/@"], a[href*="/@"], a[href^="/profile/"]'
      );
      if (profileLink) {
        let p: HTMLElement | null = profileLink.parentElement;
        for (let i = 0; i < 6 && p && p !== root; i++) {
          const txt = p.innerText?.trim() || '';
          if (txt.length < 200) {
            mark(p);
            headerMarked = true;
            break;
          }
          p = p.parentElement;
        }
        // If walk-up failed (every ancestor too big), at least nuke the
        // author link itself so the name doesn't pollute the text.
        if (!headerMarked) mark(profileLink);
      }
    }

    // 2d) Header debris that survives 2a–2c: a sibling <a> wrapping the
    //     timestamp (e.g. "1h", "40m") and the row of right-side header
    //     icons (Subscribe / "..." / X close button). These often live
    //     OUTSIDE the author-link container, so they need their own
    //     selectors.
    root.querySelectorAll<HTMLElement>('a, button, [role="button"]').forEach(
      (el) => {
        if (el.closest(`[${SKIP_ATTR}]`)) return;
        const t = (el.textContent || '').trim();
        // Relative timestamp like "1h", "40m", "Just now", "刚刚".
        if (
          /^\d{1,3}\s*(s|m|h|d|w|y|sec|secs|min|mins|hr|hrs)\b/i.test(t) ||
          /^just now$/i.test(t) ||
          /^(刚刚|\d+\s*(分钟|小时|天|周|月|年)前)$/.test(t)
        ) {
          mark(el);
          return;
        }
        // Plain icon buttons / close buttons in the header row.
        if (
          t === '' ||
          t === '×' ||
          t === '✕' ||
          t === 'X' ||
          t === '...' ||
          t === '…' ||
          t === '⋯'
        ) {
          mark(el);
        }
      }
    );

    // 3) "Hugo liked" / "Sarah restacked" breadcrumbs
    root.querySelectorAll('div, span, a').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (t.length > 60) return;
      if (/\b(liked|restacked|reposted|shared|commented)\b/i.test(t)) {
        // Only mark if this looks like a tiny inline breadcrumb.
        if (el.children.length <= 3) mark(el as HTMLElement);
      }
    });

    // 4) embedded anchor cards. Three Substack patterns to strip:
    //    a) link-card previews — <a> wrapping an image + a title (shared
    //       articles, e.g. "RL Scaling Laws for LLMs" preview card).
    //    b) quote-selection cards — <a href="?selection=…"> wrapping a
    //       chunk of quoted text from another article.
    //    c) any other anchor whose inner text is substantial: regular
    //       links inside a note are short ("read more", a URL, an
    //       inline mention); long anchor text is almost always an embed.
    root.querySelectorAll('a').forEach((a) => {
      const hasImg = !!a.querySelector('img, [class*="cover"], svg');
      const hasTitle = !!a.querySelector(
        'h1, h2, h3, h4, [class*="title"], [class*="headline"]'
      );
      const isQuoteSelection = (a.getAttribute('href') || '').includes(
        '?selection='
      );
      const longText = (a.innerText || '').trim().length > 80;
      if ((hasImg && hasTitle) || isQuoteSelection || longText) mark(a);
    });

    // 5) any obvious "Subscribe to {Author}" embedded blocks.
    root
      .querySelectorAll('[class*="subscribe"], [class*="recommendation"]')
      .forEach((el) => mark(el as HTMLElement));

    // 5b) "See more" / "Read more" expander links — pure UI, must not
    //     pollute the analyzed text.
    root
      .querySelectorAll<HTMLElement>('a, button, span, [role="button"]')
      .forEach((el) => {
        if (el.children.length > 0) return;
        const t = (el.textContent || '').trim().toLowerCase();
        if (TRUNCATE_LABELS.has(t)) mark(el);
      });

    // 6) embedded / restacked / quoted notes. When a user restacks with
    //    a comment, Substack inlines the quoted note as a bordered card
    //    inside the outer note. We must NOT score the quoted body — only
    //    the user's own commentary.
    //    First try class-based hints, then fall back to a structural
    //    signal: any avatar-sized <img> that survived header stripping
    //    (step 2) is the avatar of a quoted note; mark its smallest
    //    enclosing card.
    for (const sel of [
      '[class*="restack"]',
      '[class*="embed-note"]',
      '[class*="note-card"]',
      '[class*="quoted"]',
      '[class*="reactions"][class*="embed"]',
    ]) {
      root.querySelectorAll(sel).forEach((el) => mark(el as HTMLElement));
    }

    root.querySelectorAll('img').forEach((img) => {
      if (img.closest(`[${SKIP_ATTR}]`)) return; // already handled

      // Treat <96px images as avatars; bigger ones are likely main content.
      const r = img.getBoundingClientRect();
      const w = r.width || parseInt(img.getAttribute('width') || '0', 10);
      if (w > 96) return;

      // Walk up to the smallest container that wraps both this avatar
      // and meaningful text — that's the quoted note card.
      let p: HTMLElement | null = img.parentElement;
      while (p && p !== root) {
        if (p.hasAttribute(SKIP_ATTR)) return;
        const txt = (p.innerText || '').trim();
        if (txt.length > 80) {
          mark(p);
          return;
        }
        p = p.parentElement;
      }
    });

    // 7) clone, strip, read text.
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(`[${SKIP_ATTR}]`).forEach((n) => n.remove());

    return clone.innerText.replace(/\s+/g, ' ').trim();
  } finally {
    marked.forEach((el) => el.removeAttribute(SKIP_ATTR));
  }
}

let idCounter = 0;
function ensureId(el: HTMLElement): string {
  if (!el.dataset.saidId) {
    el.dataset.saidId = `said-${++idCounter}`;
  }
  return el.dataset.saidId;
}

/**
 * Substack collapses long note bodies and shows a "See more" button.
 * We *don't* auto-click it (would force-expand notes the user might not
 * be interested in); we just flag the note so the badge can advertise
 * that the score was based on partial text. If the user clicks "See
 * more" themselves, the DOM mutation triggers our observer, text-based
 * dedupe in main.ts notices the new content and re-scores automatically.
 */
/**
 * Substack renders the "See more" affordance as a plain `<a class="…link…">`,
 * not a `<button>` and not even with `role="button"`. So we cast a wide net:
 * any clickable-ish leaf node whose text exactly matches a known label.
 */
const TRUNCATE_LABELS = new Set([
  'see more',
  'read more',
  'show more',
  '展开',
  '查看更多',
]);

function isTruncated(root: HTMLElement): boolean {
  const candidates = root.querySelectorAll<HTMLElement>(
    'a, button, span, div, [role="button"]'
  );
  for (const el of candidates) {
    if (el.children.length > 0) continue; // leaf only
    const t = (el.textContent || '').trim().toLowerCase();
    if (TRUNCATE_LABELS.has(t)) return true;
  }
  return false;
}

export function collectNotes(): NoteHandle[] {
  const seenRoots = new Set<HTMLElement>();
  const notes: NoteHandle[] = [];

  function add(root: HTMLElement, actionBar: HTMLElement) {
    if (seenRoots.has(root)) return;
    for (const existing of seenRoots) {
      if (root.contains(existing) || existing.contains(root)) return;
    }
    const text = extractCleanText(root, actionBar);
    const truncated = isTruncated(root);
    seenRoots.add(root);
    notes.push({ root, actionBar, text, truncated, id: ensureId(root) });
  }

  for (const sel of NOTE_ROOT_SELECTORS) {
    document.querySelectorAll<HTMLElement>(sel).forEach((root) => {
      const actionBar =
        (root.querySelector(
          '[data-testid="note-footer"], [class*="reaction-bar"]'
        ) as HTMLElement | null) ??
        (root.lastElementChild as HTMLElement | null);
      if (!actionBar) return;
      add(root, actionBar);
    });
  }

  for (const bar of findActionBars()) {
    let inside = false;
    for (const r of seenRoots) {
      if (r.contains(bar)) {
        inside = true;
        break;
      }
    }
    if (inside) continue;
    const root = findNoteRoot(bar);
    if (!root) continue;
    add(root, bar);
  }

  return notes;
}
