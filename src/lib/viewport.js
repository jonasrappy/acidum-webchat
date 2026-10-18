// Coordinates of the actually visible area, rather than the full layout viewport.
export function viewportGeometry({
  height,
  layoutHeight,
  offsetTop = 0,
  editing = false,
  mobile = false,
  scale = 1,
}) {
  const full = Math.max(1, Math.round(layoutHeight));
  const visible = Math.min(full, Math.max(1, Math.round(height)));
  // Some browser versions retain offsetTop after the keyboard has closed.
  const top =
    scale < 1.05 && full - visible <= 120
      ? 0
      : Math.max(0, Math.min(Math.round(offsetTop), full - visible));
  const keyboard = mobile && editing && scale < 1.05 && full - visible > 120;
  return {
    height: visible,
    top,
    bottom: Math.max(0, full - visible - top),
    keyboard,
    compact: keyboard && visible < 360,
  };
}
