<script>
  let { name } = $props();
  const paths = {
    search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm5.5-1 4 4',
    chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2ZM7 9h10M7 13h6',
    log: 'M8 5h12M8 12h12M8 19h12M3 5h.1M3 12h.1M3 19h.1',
    room: 'M3 21h18M5 21V4h14v17M9 21v-6h6v6M9 8h1M14 8h1M9 11h1M14 11h1',
    people:
      'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a6 6 0 0 1 3 5',
    settings:
      'M4 6h16M4 12h16M4 18h16M11 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM18 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM10 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z',
    send: 'M5 12h14m-6-6 6 6-6 6',
  };
</script>

<svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
