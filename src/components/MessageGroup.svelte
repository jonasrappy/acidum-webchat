<script>
  import MessageRow from './MessageRow.svelte';
  let { group, session, showAccounts = true } = $props();
  const accountsVisible = $derived(showAccounts && !session.active);
</script>

{#if group.showDay}<div class="day-divider">{group.day}</div>{/if}
<div
  class="message-group"
  role="group"
  class:alternate={group.alternate}
  class:has-attention={group.attention}
  class:superuser={group.superuser}
  aria-label={group.name
    ? group.name +
      (group.superuser ? ' · Superuser' : '') +
      ' · ' +
      group.accounts.join(', ') +
      (group.kind === 'private' ? ' · Whisper' : '')
    : undefined}
>
  <header class="message-group-head" hidden={!group.name && !accountsVisible}>
    <div class="message-group-author" hidden={!group.name}>
      {#if group.name}
        <button
          class="message-name"
          type="button"
          title={group.superuser ? 'Superuser' : undefined}
          aria-label={group.superuser ? group.name + ' · Superuser' : undefined}
          onclick={() => session.openPerson(group.name, group.accounts)}>{group.name}</button
        >
        {#if group.kind === 'private'}<span class="private-label">Whisper</span>{/if}
      {/if}
    </div>
    {#if accountsVisible}
      <div class="message-accounts" role="group" aria-label="Your accounts">
        {#each group.accounts as name (name)}<span class="message-account" title={name}>{name}</span
          >{/each}
      </div>
    {/if}
  </header>
  <div class="message-group-lines">
    {#each group.rows as row (row.key)}<MessageRow
        {row}
        onopen={(message) => session.openMessage(message)}
      />{/each}
  </div>
</div>

<style>
  .day-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 12px 0 16px;
    color: #a7ad9b;
    font: 12px/1.5 var(--mono);
  }
  .day-divider::before,
  .day-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .message-group {
    --time-gutter: clamp(44px, calc(var(--message-font, 16px) * 2.4), 52px);
    padding: 8px 10px;
    margin-bottom: 6px;
    border-radius: 3px;
    background: #23251f;
    box-shadow: inset 2px 0 #3b4430;
  }
  .message-group.alternate {
    background: #2c2f27;
    box-shadow: inset 2px 0 #505b40;
  }
  .message-group-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
  }
  .message-group-author {
    display: flex;
    align-items: center;
    flex: 1;
    flex-wrap: wrap;
    gap: 7px;
    min-width: 0;
    min-height: 24px;
  }
  .message-name {
    background: transparent;
    border: 0;
    min-height: 24px;
    min-width: 24px;
    padding: 1px 0;
    color: inherit;
    text-align: left;
  }
  .message-group .message-name {
    color: var(--text);
    font-size: clamp(12px, var(--message-font, 16px), 24px);
    font-weight: 700;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .message-name:hover {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .message-group.has-attention .message-name {
    color: var(--accent);
  }
  .message-group.superuser {
    --superuser-color: #ffc477;
    background: #352a1f;
    box-shadow: inset 3px 0 var(--superuser-color);
  }
  .message-group.superuser.alternate {
    background: #403123;
  }
  .message-group.superuser .message-name {
    color: var(--superuser-color);
  }
  .message-accounts {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    max-width: 52%;
    margin: -8px -10px 0 auto;
    padding: 4px 7px;
    border: 1px solid #53613c;
    border-top: 0;
    border-right: 0;
    border-radius: 0 3px 0 3px;
    background: #343f27;
  }
  .message-account {
    max-width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: #e2f5bd;
    font: 12px/1.4 var(--mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .message-account + .message-account::before {
    content: '·';
    margin-right: 4px;
    color: #a6bb84;
  }
  .private-label {
    border: 0;
    border-left: 2px solid #baa6e3;
    padding: 1px 0 1px 5px;
    color: #cebee9;
    font: 11px/1.4 var(--mono);
  }
  @media (max-width: 700px) {
    .day-divider {
      font-size: 11px;
      margin: 10px 0 13px;
    }
    .message-group {
      padding: 7px 9px;
      margin-bottom: 5px;
    }
    .message-accounts {
      margin-top: -7px;
      margin-right: -9px;
    }
  }
</style>
