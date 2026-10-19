<script>
  import { onMount } from 'svelte';
  import { ChatSession } from './state/session.svelte.js';
  import Login from './components/Login.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import ChatHeader from './components/ChatHeader.svelte';
  import MobileNavigation from './components/MobileNavigation.svelte';
  import Timeline from './components/Timeline.svelte';
  import Overview from './components/Overview.svelte';
  import RoomPeople from './components/RoomPeople.svelte';
  import Composer from './components/Composer.svelte';
  import AlertBanner from './components/AlertBanner.svelte';

  const session = new ChatSession();
  let sheets = $state.raw(null);
  $effect(() => {
    if (session.dialogOpen && !sheets) sheets = import('./components/UtilitySheets.svelte');
  });
  onMount(() => session.mount());

  $effect(() => {
    document.documentElement.classList.toggle('chat-open', session.open);
    document.body.classList.toggle('chat-open', session.open);
  });
  $effect(() =>
    document.documentElement.style.setProperty('--message-font', session.textSize + 'px'),
  );
</script>

<svelte:head><title>{session.title}</title></svelte:head>
<Login {session} />
<div
  id="workspace"
  class="workspace"
  class:search-open={session.searchOpen}
  class:overview-layout={session.overviewActive}
  class:people-layout={session.roomRail}
  hidden={!session.open}
>
  <nav class="skip-navigation" aria-label="Shortcuts">
    <a
      class="skip-link"
      href="#timeline"
      onclick={(event) => {
        event.preventDefault();
        document.getElementById('timeline')?.focus({ preventScroll: true });
      }}>Skip to messages</a
    >
  </nav>
  <Sidebar {session} />
  <main class="chat-main">
    <ChatHeader {session} />
    <MobileNavigation {session} position="top" />
    {#if session.overviewActive}
      <Overview {session} />
    {:else}
      <div class="conversation-layout">
        <Timeline {session} />
        {#if session.roomRail}<RoomPeople {session} />{/if}
      </div>
    {/if}
    <Composer {session} />
    <MobileNavigation {session} position="bottom" />
  </main>
</div>
{#if sheets}
  {#await sheets}
    <p class="utility-loading" role="status">Opening…</p>
  {:then module}
    <module.default {session} />
  {:catch}
    <div class="utility-loading" role="alert">
      <p>Could not open this view.</p>
      <button class="soft-button" onclick={() => location.reload()}>Reload page</button><button
        class="soft-button"
        onclick={() => {
          sheets = null;
          session.closeDialogs();
        }}>Close</button
      >
    </div>
  {/await}
{/if}
<AlertBanner {session} />

<style>
  .utility-loading {
    position: fixed;
    z-index: 10;
    bottom: 76px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 3px;
  }
</style>
