<script>
  import { keyboardTabs } from '../actions/tabs.js';
  import Icon from './Icon.svelte';
  import AccountButton from './AccountButton.svelte';
  let { session, position } = $props();
</script>

{#if position === 'top'}
  <div
    id="mobile-accounts"
    class="mobile-accounts"
    role="tablist"
    use:keyboardTabs
    aria-label="Vælg bruger"
  >
    <button
      class="nav-item"
      role="tab"
      aria-selected={!session.active && !session.logOnly}
      aria-controls="timeline"
      tabindex={!session.active ? 0 : -1}
      class:active={!session.active && !session.logOnly}
      onclick={() => session.choose('')}>Alle</button
    >
    {#each session.accounts as account (account.name)}
      <AccountButton
        tab
        {account}
        active={session.active === account.name && !session.logOnly}
        onclick={() => session.choose(account.name)}
      />
    {/each}
  </div>
{:else}
  <nav class="bottom-nav" aria-label="Hovednavigation">
    <button
      id="bottom-chat"
      class:selected={!session.logOnly}
      aria-pressed={!session.logOnly}
      onclick={() => session.chooseLastChat()}
      ><Icon name="chat" /><span>Samtaler</span><span
        id="bottom-unread"
        class="nav-dot"
        hidden={!session.totalUnread}
      ></span></button
    >
    <button
      id="bottom-log"
      class:selected={session.logOnly}
      aria-pressed={session.logOnly}
      onclick={() => session.choose('', true)}><Icon name="log" /><span>Log</span></button
    >
    <button
      id="bottom-rooms"
      class:selected={session.dialogs.rooms}
      aria-pressed={session.dialogs.rooms}
      onclick={() => session.openDialog('rooms')}><Icon name="room" /><span>Rum</span></button
    >
    <button
      id="bottom-settings"
      class:selected={session.dialogs.settings}
      aria-pressed={session.dialogs.settings}
      onclick={() => session.openDialog('settings')}
      ><Icon name="settings" /><span>Mere</span></button
    >
  </nav>
{/if}
