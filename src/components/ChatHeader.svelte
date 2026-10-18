<script>
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  let { session } = $props();
  let searchInput;
  let filtered = $derived(Boolean(session.person || session.query) || session.mode === 'private');

  async function toggleSearch() {
    session.searchOpen = !session.searchOpen;
    if (session.searchOpen) {
      await tick();
      searchInput?.focus({ preventScroll: true });
    }
  }

  function closeSearch(event) {
    if (event.key !== 'Escape') return;
    session.searchOpen = false;
    document.getElementById('search-toggle')?.focus({ preventScroll: true });
  }
</script>

<header class="chat-header">
  <div>
    <h1 id="view-title">{session.heading}</h1>
    <p id="view-subtitle" hidden={!session.subtitle}>{session.subtitle}</p>
  </div>
  <span id="demo-label" class="demo-label" hidden={!session.demo}>Demo data</span>
  <div class="header-actions">
    <button
      id="search-toggle"
      class="icon-button"
      class:has-filter={filtered}
      aria-label={session.mode === 'private'
        ? 'Search and filter messages · Whispers only'
        : 'Search and filter messages'}
      aria-expanded={session.searchOpen}
      aria-controls="search-bar"
      title="Search and filter messages"
      onclick={toggleSearch}><Icon name="search" /></button
    >
    <button
      id="rooms-button"
      class="icon-button room-top-button"
      aria-label="Rooms and people"
      aria-haspopup="dialog"
      title="Rooms and people"
      onclick={() => session.openDialog('rooms')}><Icon name="people" /></button
    >
    <button
      id="settings-button"
      class="icon-button"
      aria-label="Settings"
      aria-haspopup="dialog"
      title="Settings"
      onclick={() => session.openDialog('settings')}><Icon name="settings" /></button
    >
  </div>
</header>
<div class="connection-notice" id="connection-notice" hidden={session.online || session.demo}>
  <span role="status">{session.status}</span>
  <button type="button" onclick={() => session.reconnect()}>Try again</button>
</div>
<div class="toolbar" id="search-bar">
  <label class="search"
    ><Icon name="search" /><input
      id="search"
      type="search"
      bind:this={searchInput}
      bind:value={session.searchText}
      oninput={() => session.searchChanged()}
      onkeydown={closeSearch}
      placeholder="Search messages…"
      aria-label="Search loaded history"
    /><button
      id="clear-search"
      class="clear-search"
      type="button"
      hidden={!session.searchText}
      aria-label="Clear search"
      onclick={() => {
        session.clearSearch();
        searchInput?.focus({ preventScroll: true });
      }}>×</button
    ><kbd hidden={Boolean(session.searchText)}>/</kbd></label
  >
  <button
    id="private-toggle"
    class="private-toggle"
    class:active={session.mode === 'private'}
    aria-label="Show whispers only"
    aria-pressed={session.mode === 'private'}
    onclick={() => session.togglePrivate()}>Whispers only</button
  >
</div>
<div
  id="view-filters"
  class="view-filters"
  role="group"
  aria-label="Active filters"
  hidden={!session.person && (session.searchOpen || (!session.query && session.mode !== 'private'))}
>
  <button
    id="person-filter"
    hidden={!session.person}
    aria-label={`Remove filter for ${session.person}`}
    onclick={() => session.clearPerson()}>{session.person} ×</button
  >
  <button
    hidden={session.searchOpen || session.mode !== 'private'}
    aria-label="Show all messages again"
    onclick={() => session.togglePrivate()}>Whispers only ×</button
  >
  <button
    hidden={session.searchOpen || !session.query}
    aria-label="Remove search filter"
    onclick={() => session.clearSearch()}>“{session.query}” ×</button
  >
</div>

<style>
  .connection-notice {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 max(var(--gutter), calc((100% - var(--content-width)) / 2));
    color: #f4d3a6;
    background: #3a3023;
    border-bottom: 1px solid #7d694d;
    font-size: 13px;
  }
  .connection-notice > span {
    overflow-wrap: anywhere;
  }
  .connection-notice button {
    flex: none;
    min-height: 44px;
    padding: 8px 0 8px 12px;
    background: transparent;
    border: 0;
    color: inherit;
    font-weight: 650;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .chat-header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 74px;
    padding: 12px max(var(--gutter), calc((100% - var(--content-width)) / 2));
    border-bottom: 1px solid var(--line);
  }
  .chat-header > div:first-child {
    flex: 1;
    min-width: 0;
  }
  .chat-header h1 {
    margin: 0;
    font-size: 23px;
    line-height: 1.2;
    letter-spacing: -0.7px;
    font-weight: 750;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #view-subtitle {
    color: var(--muted);
    font-size: 13px;
    margin: 5px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 5px;
  }
  .has-filter {
    position: relative;
    color: var(--accent);
  }
  .has-filter::after {
    content: '';
    position: absolute;
    top: 5px;
    right: 5px;
    width: 5px;
    height: 5px;
    background: var(--accent);
    border-radius: 50%;
  }
  .demo-label {
    color: var(--muted);
    border: 1px solid var(--line);
    padding: 4px 6px;
    border-radius: 2px;
    font: 10px/1.3 var(--mono);
  }
  .toolbar {
    display: none;
    flex: none;
    align-items: center;
    gap: 8px;
    padding: 10px max(var(--gutter), calc((100% - var(--content-width)) / 2));
    border-bottom: 1px solid var(--line);
  }
  :global(.search-open) .toolbar {
    display: flex;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    max-width: 460px;
    min-height: 44px;
    padding: 0 10px;
    background: #292d24;
    border: 1px solid var(--control-line);
    border-radius: 3px;
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search :global(svg) {
    color: var(--muted);
    width: 18px;
    height: 18px;
  }
  .search input {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 8px 0;
    background: none;
    border: 0;
    color: var(--text);
    font-size: 16px;
  }
  .search input:focus {
    outline: 0;
  }
  kbd {
    padding: 1px 5px;
    color: var(--muted);
    border: 1px solid #535c46;
    border-radius: 2px;
    font: 11px/1.5 var(--mono);
  }
  .private-toggle {
    flex: none;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--control-line);
    border-radius: 3px;
    background: transparent;
    color: #c0c6b6;
    font-size: 13px;
    white-space: nowrap;
  }
  .private-toggle.active {
    background: var(--active);
    border-color: var(--accent);
    color: var(--accent);
  }
  .clear-search {
    flex: none;
    width: 32px;
    height: 40px;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--muted);
    font-size: 24px;
  }
  .view-filters {
    display: flex;
    flex: none;
    gap: 6px;
    flex-wrap: wrap;
    padding: 8px max(var(--gutter), calc((100% - var(--content-width)) / 2));
    border-bottom: 1px solid var(--line);
  }
  .view-filters button {
    flex: none;
    min-height: 36px;
    max-width: 100%;
    padding: 6px 10px;
    background: #373326;
    border: 1px solid #766642;
    border-radius: 2px;
    color: #ebd5a2;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 700px) {
    .connection-notice {
      padding-inline: 16px;
    }
    .chat-header {
      min-height: 56px;
      padding: 6px 12px 6px 16px;
      gap: 8px;
    }
    .chat-header h1 {
      font-size: 20px;
      letter-spacing: -0.5px;
    }
    #view-subtitle {
      font-size: 12px;
      margin-top: 3px;
    }
    .header-actions {
      gap: 4px;
    }
    .header-actions .room-top-button,
    .header-actions #settings-button {
      display: none;
    }
    .demo-label {
      display: none;
    }
    .toolbar {
      gap: 7px;
      padding: 7px 12px;
    }
    .search {
      max-width: none;
      padding-inline: 8px;
    }
    .search input {
      font-size: 16px;
    }
    .search kbd {
      display: none;
    }
    .private-toggle {
      padding-inline: 9px;
      font-size: 12px;
    }
    .view-filters {
      padding: 6px 12px;
    }
    :global(.keyboard-open) .chat-header {
      min-height: 54px;
    }
    :global(.keyboard-open) #view-subtitle {
      display: none;
    }
    :global(.compact-viewport) .chat-header {
      min-height: 44px;
      padding-block: 2px;
    }
  }
  @media (max-width: 700px) and (max-height: 580px) {
    .chat-header {
      min-height: 48px;
      padding-block: 4px;
    }
    #view-subtitle {
      display: none;
    }
  }
</style>
