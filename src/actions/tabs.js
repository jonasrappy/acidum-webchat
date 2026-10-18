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
    const item = tab.getBoundingClientRect();
    const list = node.getBoundingClientRect();
    if (item.left < list.left) node.scrollLeft -= list.left - item.left;
    else if (item.right > list.right) node.scrollLeft += item.right - list.right;
  }
  node.addEventListener('keydown', keydown);
  return { destroy: () => node.removeEventListener('keydown', keydown) };
}
