<script>
  import { onMount } from 'svelte';
  import { ChatSession } from './state/session.svelte.js';
  import Login from './components/Login.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import ChatHeader from './components/ChatHeader.svelte';
  import MobileNavigation from './components/MobileNavigation.svelte';
  import Timeline from './components/Timeline.svelte';
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
<div id="workspace" class="workspace" class:search-open={session.searchOpen} hidden={!session.open}>
  <nav class="skip-navigation" aria-label="Genveje">
    <a
      class="skip-link"
      href="#timeline"
      onclick={(event) => {
        event.preventDefault();
        document.getElementById('timeline')?.focus({ preventScroll: true });
      }}>Gå til beskeder</a
    >
  </nav>
  <Sidebar {session} />
  <main class="chat-main">
    <ChatHeader {session} />
    <MobileNavigation {session} position="top" />
    <Timeline {session} />
    <Composer {session} />
    <MobileNavigation {session} position="bottom" />
  </main>
</div>
{#if sheets}
  {#await sheets}
    <p class="utility-loading" role="status">Åbner…</p>
  {:then module}
    <module.default {session} />
  {:catch}
    <div class="utility-loading" role="alert">
      <p>Kunne ikke åbne visningen.</p>
      <button class="soft-button" onclick={() => location.reload()}>Genindlæs siden</button><button
        class="soft-button"
        onclick={() => {
          sheets = null;
          session.closeDialogs();
        }}>Luk</button
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
