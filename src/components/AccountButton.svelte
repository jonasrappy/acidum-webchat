<script>
  import { badgeText } from '../lib/format.js';
  import { revealTab } from '../actions/tabs.js';
  let { account, active, onclick, tab = false } = $props();
</script>

<button
  class="nav-item"
  class:active
  type="button"
  role={tab ? 'tab' : undefined}
  aria-pressed={tab ? undefined : active}
  aria-selected={tab ? active : undefined}
  aria-controls={tab ? 'timeline' : undefined}
  tabindex={tab ? (active ? 0 : -1) : undefined}
  {onclick}
  use:revealTab={tab && active}
>
  <span class="account-copy">
    <span class="account-name">{account.name}</span>
    {#if account.room?.name}<span class="account-room">{account.room.name}</span>{/if}
  </span>
  {#if account.unread}<span class="badge">{badgeText(account.unread)}</span>{/if}
</button>

<style>
  .account-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .account-name {
    font-size: 15px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .account-room {
    font-size: 12px;
    line-height: 1.4;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.nav-item.active) .account-room {
    color: #b8c59b;
  }
</style>
