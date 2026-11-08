import { config } from '@/config';
import { getPlayhead, usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';

/**
 * Android TV shell only. The Android APK targets a television, so it always
 * uses the D-pad layer; the desktop build keeps its mouse and keyboard.
 */
export const isTv = config.native && /Android/i.test(navigator.userAgent);

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="slider"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type Direction = 'up' | 'down' | 'left' | 'right';

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Android DPAD key codes, for remotes whose events carry no key name. */
const ARROW_CODES: Record<number, Direction> = {
  19: 'up',
  20: 'down',
  21: 'left',
  22: 'right',
};

function directionOf(event: KeyboardEvent): Direction | null {
  return ARROWS[event.key] ?? ARROW_CODES[event.keyCode] ?? null;
}

function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2;
}

/** The topmost overlay owns the arrows; the page behind must not steal them. */
function activeScope(): HTMLElement {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>('[data-full-screen], [role="dialog"][aria-modal="true"]'),
  ).filter(isVisible);
  return overlays[overlays.length - 1] ?? document.body;
}

function focusables(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

let revealed: HTMLElement[] = [];

/**
 * Hover-only actions sit at opacity 0. Reveal the focused control and any
 * faded ancestor so the D-pad never lands on something invisible.
 */
function reveal(element: HTMLElement): void {
  for (const node of revealed) node.style.removeProperty('opacity');
  revealed = [];
  let node: HTMLElement | null = element;
  while (node && node !== document.body) {
    if (Number.parseFloat(getComputedStyle(node).opacity) === 0) {
      node.style.setProperty('opacity', '1', 'important');
      revealed.push(node);
    }
    node = node.parentElement;
  }
}

function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  reveal(element);
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function focusFirst(scope: HTMLElement): boolean {
  const [first] = focusables(scope);
  if (!first) return false;
  focusElement(first);
  return true;
}

/**
 * Opening a page on Back, or a player on Close, is a D-pad trap. Start on the
 * content; the full-screen player starts on play/pause.
 */
function focusPreferred(scope: HTMLElement): boolean {
  if (scope.hasAttribute('data-full-screen')) {
    const play = scope.querySelector<HTMLElement>('button[aria-label="Play"], button[aria-label="Pause"]');
    if (play) {
      focusElement(play);
      return true;
    }
  }
  const [first] = focusables(scope).filter(
    (element) => !/^(back|close)$/i.test(element.getAttribute('aria-label') ?? ''),
  );
  if (first) {
    focusElement(first);
    return true;
  }
  return focusFirst(scope);
}

function move(direction: Direction): boolean {
  const scope = activeScope();
  if (scope.getAttribute('role') === 'menu') return false;
  const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const list = focusables(scope).filter((element) => element !== current);

  if (!current || current === document.body || !scope.contains(current)) {
    return focusPreferred(scope);
  }

  const currentRect = current.getBoundingClientRect();
  const currentX = (currentRect.left + currentRect.right) / 2;
  const currentY = (currentRect.top + currentRect.bottom) / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const element of list) {
    if (element.contains(current) || current.contains(element)) continue;
    const rect = element.getBoundingClientRect();
    const dx = (rect.left + rect.right) / 2 - currentX;
    const dy = (rect.top + rect.bottom) / 2 - currentY;
    const horizontal = direction === 'left' || direction === 'right';
    if (direction === 'left' && dx > -1) continue;
    if (direction === 'right' && dx < 1) continue;
    if (direction === 'up' && dy > -1) continue;
    if (direction === 'down' && dy < 1) continue;
    const primary = horizontal ? Math.abs(dx) : Math.abs(dy);
    const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
    // Alignment matters more than raw distance: stay in the same row or column.
    const score = primary + cross * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = element;
    }
  }

  if (!best) return false;
  focusElement(best);
  return true;
}

function typing(element: EventTarget | null): boolean {
  const node = element as HTMLElement | null;
  if (!node) return false;
  return node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName);
}

function onKeyDown(event: KeyboardEvent): void {
  // Text fields own their arrows; Escape leaves the field.
  if (typing(event.target)) {
    if (event.key === 'Escape') {
      (event.target as HTMLElement).blur();
      event.preventDefault();
    }
    return;
  }
  // Menus own Up/Down, and a focused slider owns Left/Right.
  if ((event.target as HTMLElement | null)?.closest('[role="menu"]')) return;
  if ((event.target as HTMLInputElement | null)?.type === 'range') return;
  if ((document.activeElement as HTMLElement | null)?.getAttribute('role') === 'slider') return;

  const direction = directionOf(event);
  if (direction) {
    if (move(direction)) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  // Some television remotes send OK as an unnamed key code instead of Enter.
  if (event.key === 'Select' || (event.keyCode === 23 && event.key !== 'Enter')) {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) {
      event.preventDefault();
      active.click();
    }
    return;
  }

  // Remote transport keys. Media Session answers most of these already; this
  // covers WebViews that deliver them as ordinary keydowns.
  const player = usePlayer.getState();
  const position = getPlayhead()?.sec ?? 0;
  switch (event.key) {
    case 'MediaPlayPause':
      event.preventDefault();
      player.togglePlay();
      break;
    case 'MediaTrackNext':
      event.preventDefault();
      player.next();
      break;
    case 'MediaTrackPrevious':
      event.preventDefault();
      player.previous();
      break;
    case 'MediaRewind':
      event.preventDefault();
      player.seek(Math.max(0, position - 10));
      break;
    case 'MediaFastForward':
      event.preventDefault();
      player.seek(position + 10);
      break;
  }
}

function mainScope(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#scrollable-page');
}

/**
 * The home page is lazy, so the first focusable appears a few frames after
 * boot. Retry briefly instead of focusing nothing.
 */
function focusInitial(attempt = 0): void {
  const overlay = activeScope();
  if (overlay !== document.body && focusPreferred(overlay)) return;
  const main = mainScope();
  if (main && focusPreferred(main)) return;
  if (attempt < 20) window.setTimeout(() => focusInitial(attempt + 1), 150);
}

/**
 * Android's Back button calls webView.goBack(). Give an open fullscreen player
 * or side panel one history entry of its own, so Back closes it instead of
 * leaving the page.
 */
function installBackHandling(): void {
  let overlayEntry = false;
  let closingFromPop = false;
  let trigger: HTMLElement | null = null;

  useUi.subscribe((state) => {
    const open = state.fullScreen || state.sidePanel !== null;
    if (open && !overlayEntry) {
      overlayEntry = true;
      trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      history.pushState({ tvOverlay: true }, '');
    } else if (!open && overlayEntry && !closingFromPop) {
      overlayEntry = false;
      trigger = null;
      history.back();
    }
  });

  window.addEventListener('popstate', () => {
    if (!overlayEntry) return;
    overlayEntry = false;
    closingFromPop = true;
    const backTo = trigger;
    trigger = null;
    const ui = useUi.getState();
    ui.setFullScreen(false);
    ui.closeSidePanel();
    if (backTo?.isConnected) focusElement(backTo);
    window.setTimeout(() => {
      closingFromPop = false;
    }, 0);
  });
}

export function installTvMode(): void {
  if (!isTv) return;
  document.documentElement.dataset.tv = '';
  installBackHandling();
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement) reveal(event.target);
  });
  window.addEventListener('keydown', onKeyDown, true);

  // A chosen card may unmount and leave focus on the body. Put the D-pad back
  // on the new page's first control.
  window.addEventListener('click', () => {
    window.setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const overlay = activeScope();
      if (overlay !== document.body) focusPreferred(overlay);
      else {
        const main = mainScope();
        if (main) focusPreferred(main);
      }
    }, 250);
  });

  requestAnimationFrame(() => requestAnimationFrame(() => focusInitial()));

  // The feed is lazy: once its first control exists, put the D-pad there.
  let settled = false;
  const observer = new MutationObserver(() => {
    if (settled || (document.activeElement && document.activeElement !== document.body)) return;
    const main = mainScope();
    if (main && focusPreferred(main)) {
      settled = true;
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 20_000);
}
