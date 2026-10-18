<script>
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  let { session } = $props();
  let searchInput;
  let filtered = $derived(Boolean(session.person) || session.mode === 'private');

  async function toggleSearch() {
    session.searchOpen = !session.searchOpen;
    if (session.searchOpen) {
      await tick();
      searchInput?.focus({ preventScroll: true });
    }
  }
</script>

<header class="chat-header">
  <div>
    <h1 id="view-title">{session.heading}</h1>
    <p id="view-subtitle" hidden={!session.subtitle}>{session.subtitle}</p>
  </div>
  <span id="demo-label" class="demo-label" hidden={!session.demo}>Eksempeldata</span>
  <div class="header-actions">
    <button
      id="search-toggle"
      class="icon-button"
      class:has-filter={filtered}
      aria-label={session.mode === 'private'
        ? 'Søg og filtrér beskeder · Kun hvisken'
        : 'Søg og filtrér beskeder'}
      aria-expanded={session.searchOpen}
      onclick={toggleSearch}><Icon name="search" /></button
    >
    <button
      id="rooms-button"
      class="icon-button room-top-button"
      aria-label="Rum og brugere"
      onclick={() => session.openDialog('rooms')}><Icon name="people" /></button
    >
    <button
      id="settings-button"
      class="icon-button"
      aria-label="Indstillinger"
      onclick={() => session.openDialog('settings')}><Icon name="settings" /></button
    >
  </div>
</header>
<div class="toolbar" id="search-bar">
  <label class="search"
    ><span aria-hidden="true">⌕</span><input
      id="search"
      type="search"
      bind:this={searchInput}
      bind:value={session.searchText}
      oninput={() => session.searchChanged()}
      placeholder="Søg i beskeder…"
      aria-label="Søg i indlæst historik"
    /><kbd>/</kbd></label
  >
  <button
    id="private-toggle"
    class="private-toggle"
    class:active={session.mode === 'private'}
    aria-label="Vis kun hviskebeskeder"
    aria-pressed={session.mode === 'private'}
    onclick={() => session.togglePrivate()}>Kun hvisken</button
  >
  <button
    id="clear-search"
    class="text-button"
    hidden={!session.query}
    onclick={() => session.clearSearch()}>Nulstil</button
  >
</div>
<div id="view-filters" class="view-filters" hidden={!session.person}>
  <button id="person-filter" hidden={!session.person} onclick={() => session.clearPerson()}
    >{session.person} ×</button
  >
</div>

<style>
  .chat-header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 74px;
    padding: 12px 24px;
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
    font: 11px/1.5 var(--mono);
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
    padding: 9px 24px;
    border-bottom: 1px solid var(--line);
  }
  :global(.search-open) .toolbar {
    display: flex;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 9px;
    flex: 1;
    min-width: 0;
    max-width: 460px;
    padding: 8px 10px;
    background: #292d24;
    border: 1px solid #464e3c;
    border-radius: 3px;
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search > span {
    color: var(--muted);
    font-size: 24px;
    line-height: 20px;
  }
  .search input {
    width: 100%;
    min-width: 0;
    padding: 1px 0;
    background: none;
    border: 0;
    color: var(--text);
    font-size: 15px;
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
    min-height: 38px;
    padding: 7px 9px;
    border: 1px solid #464e3c;
    border-radius: 3px;
    background: transparent;
    color: #c0c6b6;
    font-size: 12px;
    white-space: nowrap;
  }
  .private-toggle.active {
    background: var(--active);
    border-color: var(--accent);
    color: var(--accent);
  }
  #clear-search {
    flex: none;
    font-size: 11px;
  }
  .view-filters {
    display: flex;
    flex: none;
    gap: 6px;
    padding: 8px 24px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .view-filters button {
    flex: none;
    min-height: 34px;
    padding: 6px 10px;
    background: #373326;
    border: 1px solid #766642;
    border-radius: 2px;
    color: #ebd5a2;
    font-size: 12px;
  }
  @media (max-width: 1000px) and (min-width: 701px) {
    .chat-header,
    .toolbar,
    .view-filters {
      padding-inline: 18px;
    }
  }
  @media (max-width: 700px) {
    .chat-header {
      min-height: 54px;
      padding: 7px 14px;
      gap: 8px;
    }
    .chat-header h1 {
      font-size: 21px;
      letter-spacing: -0.7px;
    }
    #view-subtitle {
      font-size: 10px;
      margin-top: 3px;
    }
    .header-actions {
      gap: 4px;
    }
    .header-actions .room-top-button,
    .header-actions #settings-button {
      display: none;
    }
    .header-actions #search-toggle {
      width: 40px;
      height: 40px;
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
      padding: 8px;
    }
    .search input {
      font-size: 16px;
    }
    .search kbd {
      display: none;
    }
    .private-toggle {
      padding: 7px 8px;
      font-size: 11px;
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
    :global(.compact-viewport) .view-filters {
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
