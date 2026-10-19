<script>
  import Brand from './Brand.svelte';
  import Icon from './Icon.svelte';
  import AccountButton from './AccountButton.svelte';
  import { badgeText } from '../lib/format.js';
  let { session } = $props();
</script>

<aside class="sidebar">
  <Brand />
  <p class="nav-label">Overview</p>
  <button
    id="all-button"
    class="nav-item"
    class:active={!session.active && !session.logOnly}
    aria-pressed={!session.active && !session.logOnly}
    onclick={() => session.choose('')}
  >
    <Icon name="chat" /> All chats
    <span id="total-unread" class="badge" hidden={!session.totalUnread}
      >{badgeText(session.totalUnread)}</span
    >
  </button>
  <button
    id="log-button"
    class="nav-item"
    class:active={session.logOnly}
    aria-pressed={session.logOnly}
    onclick={() => session.choose('', true)}><Icon name="log" /> Event log</button
  >
  <div class="nav-label account-label">
    Your accounts <span id="account-count">{session.accounts.length}</span>
  </div>
  <nav id="accounts" aria-label="Accounts">
    {#each session.accounts as account (account.name)}
      <AccountButton
        {account}
        active={session.active === account.name && !session.logOnly}
        onclick={() => session.choose(account.name)}
      />
    {/each}
  </nav>
</aside>

<style>
  .nav-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    padding: 26px 12px 14px;
    background: #20211c;
    border-right: 1px solid var(--line);
    overflow: auto;
  }
  .sidebar :global(.brand) {
    margin: 0 10px 28px;
  }
  .nav-label {
    margin: 0 11px 8px;
  }
  .sidebar :global(.nav-item.active) {
    background: var(--active);
    color: var(--accent);
    box-shadow: inset 2px 0 var(--accent);
  }
  .account-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 29px;
  }
  #account-count {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 1000px) and (min-width: 701px) {
    .sidebar {
      padding-inline: 9px;
    }
    .sidebar :global(.brand) {
      font-size: 29px;
      gap: 8px;
    }
  }
  @media (max-width: 700px) {
    .sidebar {
      display: none;
    }
  }
</style>
