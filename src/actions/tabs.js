function reveal(node) {
  const item = node.getBoundingClientRect();
  const list = node.parentElement.getBoundingClientRect();
  if (item.left < list.left) node.parentElement.scrollLeft -= list.left - item.left;
  else if (item.right > list.right) node.parentElement.scrollLeft += item.right - list.right;
}

export function revealTab(node, active) {
  let frame;
  function update(active) {
    cancelAnimationFrame(frame);
    if (active) frame = requestAnimationFrame(() => reveal(node));
  }
  update(active);
  return { update, destroy: () => cancelAnimationFrame(frame) };
}

export function keyboardTabs(node) {
  function keydown(event) {
    if (!event.target.matches('[role=tab]')) return;
    const tabs = [...node.querySelectorAll('[role=tab]:not(:disabled)')];
    const index = tabs.indexOf(event.target);
    const next = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next == null) return;
    event.preventDefault();
    const tab = tabs[next];
    tab.click();
    tab.focus({ preventScroll: true });
    reveal(tab);
  }
  node.addEventListener('keydown', keydown);
  const resize = new ResizeObserver(() => {
    const selected = node.querySelector('[aria-selected=true]');
    if (selected) reveal(selected);
  });
  resize.observe(node);
  return {
    destroy() {
      node.removeEventListener('keydown', keydown);
      resize.disconnect();
    },
  };
}
