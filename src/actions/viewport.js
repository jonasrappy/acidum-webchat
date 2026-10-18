import { viewportGeometry } from '../lib/viewport.js';

export function trackViewport(onResize) {
  let frame = 0;
  let baseline = 0;
  let width = 0;
  let signature = '';
  let focusTimers = [];
  const listeners = [];

  function update() {
    frame = 0;
    const viewport = window.visualViewport;
    const editing =
      document.activeElement?.matches(
        'input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]',
      ) || false;
    if (!editing || width !== innerWidth) {
      baseline = Math.max(innerHeight, document.documentElement.clientHeight);
      width = innerWidth;
    }
    const geometry = viewportGeometry({
      height: viewport?.height || innerHeight,
      layoutHeight: Math.max(innerHeight, document.documentElement.clientHeight, baseline),
      offsetTop: viewport?.offsetTop || 0,
      scale: viewport?.scale || 1,
      mobile: matchMedia('(max-width:700px)').matches,
      editing,
    });
    const next = JSON.stringify(geometry);
    if (signature === next) return;
    signature = next;
    const style = document.documentElement.style;
    style.setProperty('--app-height', geometry.height + 'px');
    style.setProperty('--viewport-top', geometry.top + 'px');
    style.setProperty('--viewport-bottom', geometry.bottom + 'px');
    document.body.classList.toggle('keyboard-open', geometry.keyboard);
    document.body.classList.toggle('compact-viewport', geometry.compact);
    onResize();
  }

  function queue() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function settle() {
    focusTimers.forEach(clearTimeout);
    queue();
    focusTimers = [80, 250, 500].map((delay) => setTimeout(queue, delay));
  }

  function listen(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler, { passive: true });
    listeners.push(() => target.removeEventListener(event, handler));
  }

  listen(window.visualViewport, 'resize', queue);
  listen(window.visualViewport, 'scroll', queue);
  listen(window, 'resize', queue);
  listen(window, 'orientationchange', () => {
    baseline = 0;
    settle();
  });
  listen(document, 'focusin', settle);
  listen(document, 'focusout', settle);
  update();

  return () => {
    cancelAnimationFrame(frame);
    focusTimers.forEach(clearTimeout);
    listeners.forEach((remove) => remove());
    document.body.classList.remove('keyboard-open', 'compact-viewport');
  };
}
