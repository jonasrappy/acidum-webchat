<script>
  import Brand from './Brand.svelte';
  import Icon from './Icon.svelte';
  import AccountButton from './AccountButton.svelte';
  import { badgeText } from '../lib/format.js';
  let { session } = $props();
</script>

<aside class="sidebar">
  <Brand />
  <p class="nav-label">Overblik</p>
  <button
    id="all-button"
    class="nav-item"
    class:active={!session.active && !session.logOnly}
    aria-pressed={!session.active && !session.logOnly}
    onclick={() => session.choose('')}
  >
    <Icon name="chat" /> Alle samtaler
    <span id="total-unread" class="badge" hidden={!session.totalUnread}
      >{badgeText(session.totalUnread)}</span
    >
  </button>
  <button
    id="log-button"
    class="nav-item"
    class:active={session.logOnly}
    aria-pressed={session.logOnly}
    onclick={() => session.choose('', true)}><Icon name="log" /> Hændelseslog</button
  >
  <div class="nav-label account-label">
    Dine brugere <span id="account-count">{session.accounts.length}</span>
  </div>
  <nav id="accounts" aria-label="Brugere">
    {#each session.accounts as account (account.name)}
      <AccountButton
        {account}
        active={session.active === account.name && !session.logOnly}
        onclick={() => session.choose(account.name)}
      />
    {/each}
  </nav>
  <div class="sidebar-bottom">
    <div class="connection">
      <span id="status-dot" class="status-dot" class:online={session.online}></span><span
        id="status"
        role="status">{session.status}</span
      >
    </div>
    <button id="reconnect" class="text-button" onclick={() => session.reconnect()}
      >Forbind igen</button
    >
    <button id="disconnect" class="text-button muted" onclick={() => session.disconnect()}
      >Afbryd</button
    >
  </div>
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
  .sidebar-bottom {
    margin-top: auto;
    padding: 24px 11px 0;
  }
  .connection {
    display: flex;
    gap: 7px;
    align-items: center;
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 5px;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #e1b278;
    flex: none;
  }
  .status-dot.online {
    background: var(--accent);
  }
  .sidebar-bottom .text-button {
    margin-right: 14px;
    font-size: 13px;
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
