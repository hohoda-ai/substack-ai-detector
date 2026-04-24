import type { DetectionResult } from '../providers/types';

const BADGE_ATTR = 'data-said-badge';
const STATE_ATTR = 'data-said-state';

const PALETTE: Record<DetectionResult['label'], { bg: string; fg: string; icon: string; text: string }> = {
  human: { bg: '#d1fae5', fg: '#047857', icon: '🌱', text: 'Human' },
  mixed: { bg: '#fef3c7', fg: '#b45309', icon: '⚠️', text: 'Mixed' },
  ai:    { bg: '#fee2e2', fg: '#b91c1c', icon: '🤖', text: 'AI' },
  na:    { bg: '#f3f4f6', fg: '#6b7280', icon: '•',  text: 'N/A' },
};

function ensureStyles() {
  if (document.getElementById('said-styles')) return;
  const style = document.createElement('style');
  style.id = 'said-styles';
  style.textContent = `
    .said-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      padding: 2px 10px;
      height: 24px;
      border-radius: 9999px;
      font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      white-space: nowrap;
      user-select: none;
      transition: opacity 120ms ease, transform 120ms ease;
      opacity: 0;
      transform: translateY(2px);
    }
    .said-badge[data-said-state="ready"] { opacity: 1; transform: none; }
    .said-badge[data-said-state="loading"] {
      background: #f3f4f6 !important;
      color: #6b7280 !important;
      opacity: 0.8;
    }
    .said-badge[data-said-state="loading"] .said-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: currentColor;
      animation: said-pulse 1s ease-in-out infinite;
    }
    @keyframes said-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
    .said-badge-icon { font-size: 12px; line-height: 1; }
  `;
  document.head.appendChild(style);
}

export function getOrCreateBadge(actionBar: HTMLElement): HTMLSpanElement {
  ensureStyles();
  let badge = actionBar.querySelector<HTMLSpanElement>(`[${BADGE_ATTR}]`);
  if (badge) return badge;

  // Make the action bar flex so margin-left: auto pushes our badge right.
  const computed = getComputedStyle(actionBar);
  if (computed.display.indexOf('flex') === -1) {
    actionBar.style.display = 'flex';
    actionBar.style.alignItems = 'center';
  }

  badge = document.createElement('span');
  badge.className = 'said-badge';
  badge.setAttribute(BADGE_ATTR, '1');
  setLoading(badge);
  actionBar.appendChild(badge);
  return badge;
}

export function setLoading(badge: HTMLSpanElement): void {
  badge.setAttribute(STATE_ATTR, 'loading');
  badge.innerHTML = '<span class="said-dot"></span><span>Scanning…</span>';
}

export function renderResult(
  badge: HTMLSpanElement,
  result: DetectionResult,
  analyzedText?: string,
  truncated = false
): void {
  const palette = PALETTE[result.label];
  badge.setAttribute(STATE_ATTR, 'ready');
  badge.style.background = palette.bg;
  badge.style.color = palette.fg;

  const partial = truncated ? '*' : '';
  const tooltipNote = truncated
    ? '\n\n(*) Note was collapsed by Substack — score is based on the visible part only. Click "See more" to re-score with the full text.'
    : '';
  const analyzedBlock = analyzedText
    ? `\n\nAnalyzed text (${analyzedText.length} chars):\n${truncate(analyzedText, 400)}`
    : '';

  if (result.label === 'na') {
    badge.title = `Skipped: ${result.reason ?? 'unknown'}${analyzedBlock}${tooltipNote}`;
    badge.innerHTML = `<span class="said-badge-icon">${palette.icon}</span><span>${palette.text}${partial}</span>`;
    return;
  }

  const pct = Math.round(result.score * 100);
  badge.title = `AI probability: ${pct}%${analyzedBlock}${tooltipNote}`;
  badge.innerHTML = `
    <span class="said-badge-icon">${palette.icon}</span>
    <span>${pct}% AI${partial}</span>
  `;
}

export function renderError(badge: HTMLSpanElement, message: string): void {
  badge.setAttribute(STATE_ATTR, 'ready');
  badge.style.background = '#f3f4f6';
  badge.style.color = '#6b7280';
  badge.title = message;
  badge.innerHTML = `<span class="said-badge-icon">!</span><span>Err</span>`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
