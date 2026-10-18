import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewportGeometry } from '../src/lib/viewport.js';
test('keyboard resize and viewport pan keep the composer at the visible bottom', () => {
  const geometry = viewportGeometry({
    height: 440,
    layoutHeight: 844,
    offsetTop: 130,
    editing: true,
    mobile: true,
  });
  assert.deepEqual(geometry, {
    height: 440,
    top: 130,
    bottom: 274,
    keyboard: true,
    compact: false,
  });
  assert.equal(geometry.top + geometry.height + geometry.bottom, 844);
});
test('stale keyboard offset is discarded after the viewport is restored', () => {
  assert.equal(
    viewportGeometry({ height: 770, layoutHeight: 844, offsetTop: 74, mobile: true }).top,
    0,
  );
  assert.deepEqual(
    viewportGeometry({ height: 844, layoutHeight: 844, offsetTop: 130, mobile: true }),
    { height: 844, top: 0, bottom: 0, keyboard: false, compact: false },
  );
});
test('pinch zoom, desktop and keyboard-free toolbars do not hide navigation', () => {
  for (const props of [
    { scale: 2, editing: true, mobile: true },
    { editing: false, mobile: true },
    { editing: true, mobile: false },
  ])
    assert.equal(viewportGeometry({ height: 440, layoutHeight: 844, ...props }).keyboard, false);
  assert.equal(
    viewportGeometry({ height: 770, layoutHeight: 844, editing: true, mobile: true }).keyboard,
    false,
  );
  assert.equal(
    viewportGeometry({ height: 240, layoutHeight: 390, editing: true, mobile: true }).compact,
    true,
  );
});
