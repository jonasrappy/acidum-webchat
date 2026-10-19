<script module>
  const attach = (node, callback) => callback(node);
</script>

<script>
  import { onMount } from 'svelte';
  import MessageGroup from './MessageGroup.svelte';
  let { session } = $props();
  let root;
  let observer;
  const nodes = new Map();

  function watch(node, panel) {
    nodes.set(node, panel);
    observer?.observe(node);
    return {
      destroy: () => {
        observer?.unobserve(node);
        nodes.delete(node);
        panel.visible = false;
      },
    };
  }

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const panel = nodes.get(entry.target);
          if (panel) panel.visible = entry.isIntersecting && entry.intersectionRatio >= 0.99;
        }
        session.clearAttention();
        session.syncNavigation();
      },
      { root, threshold: [0, 0.99] },
    );
    for (const node of nodes.keys()) observer.observe(node);
    return () => observer.disconnect();
  });
</script>

<div
  id="timeline"
  class="overview"
  class:multiple-rows={session.overview.panels.length > 2}
  class:many-rooms={session.overview.panels.length > 3}
  bind:this={root}
  tabindex="0"
  role="tabpanel"
  aria-labelledby="view-title"
>
  {#each session.overview.panels as panel, index (panel.key)}
    <section
      class="room-panel"
      class:replying={panel.members.has(session.composer.account)}
      aria-labelledby={`panel-title-${index}`}
      use:watch={panel}
    >
      <header class="panel-header">
        <h2 id={`panel-title-${index}`}>
          {panel.accounts[0].room?.name ||
            panel.accounts.map((account) => account.name).join(' · ')}
          {#if panel.accounts[0].room?.id != null}<small>{panel.accounts[0].room.id}</small>{/if}
        </h2>
        <div class="panel-accounts" role="group" aria-label="Reply as">
          {#each panel.accounts as account (account.name)}
            <button
              class="reply-account"
              class:selected={session.composer.account === account.name}
              aria-label={`Reply as ${account.name}`}
              aria-pressed={session.composer.account === account.name}
              title={`Reply as ${account.name}`}
              onclick={() => session.replyAs(account.name)}
              >{account.name}{#if account.unread}<span class="badge">{account.unread}</span
                >{/if}</button
            >
          {/each}
        </div>
      </header>
      <div class="panel-conversation">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (Each scrollable conversation needs keyboard access.) -->
        <div
          class="panel-messages"
          role="region"
          aria-label={`Messages for ${panel.accounts.map((account) => account.name).join(', ')}`}
          tabindex="0"
          use:attach={(node) => panel.attach(node)}
          onscroll={() => session.overview.onScroll(panel, session)}
        >
          <button
            class="panel-older"
            hidden={!panel.hasOlder}
            disabled={panel.history.loading}
            onclick={() => session.overview.loadOlder(panel, session)}>Load older messages</button
          >
          {#if panel.history.status}<p class="panel-status" role="status">
              {panel.history.status}
            </p>{/if}
          {#each panel.timeline.groups as group (group.key)}<MessageGroup
              {group}
              {session}
            />{/each}
          {#if !panel.timeline.groups.length}
            <p class="panel-empty">
              {session.query || session.person || session.mode === 'private'
                ? 'No messages found'
                : 'Waiting for messages…'}
            </p>
          {/if}
        </div>
        {#if panel.notice}
          <button class="panel-latest" onclick={() => session.overview.latest(panel, session)}
            >New messages ↓</button
          >
        {/if}
      </div>
    </section>
  {/each}
</div>

<style>
  .overview {
    display: grid;
    flex: 1;
    min-height: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: minmax(190px, 1fr);
    grid-auto-rows: minmax(190px, 1fr);
    gap: 12px;
    padding: 12px var(--gutter);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .overview.multiple-rows {
    grid-template-rows: repeat(2, minmax(190px, 1fr));
  }
  .room-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border: 1px solid #505747;
    border-radius: 3px;
    overflow: hidden;
    background: #1e201a;
  }
  .room-panel:only-child {
    grid-column: 1 / -1;
  }
  .room-panel.replying {
    border-color: #8a9f60;
  }
  .panel-header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0 12px;
    padding: 3px 10px;
    min-height: 48px;
    border-bottom: 1px solid var(--line);
    background: #292d23;
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  h2 small {
    color: var(--muted);
    font: 11px/1.5 var(--mono);
  }
  .panel-accounts {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
  }
  .reply-account {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 24px;
    min-height: 36px;
    max-width: 100%;
    padding: 5px 8px;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: #c4cbb8;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .reply-account:hover {
    background: var(--surface);
  }
  .reply-account.selected {
    background: var(--active);
    color: var(--accent);
    box-shadow: inset 0 -2px var(--accent);
  }
  .panel-conversation {
    display: flex;
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .panel-messages {
    flex: 1;
    min-width: 0;
    overflow: auto;
    overflow-anchor: none;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #505744 transparent;
    padding: 6px 8px 8px;
  }
  .panel-older {
    display: block;
    min-height: 36px;
    margin: 4px auto 10px;
    padding: 5px 10px;
    border: 1px solid var(--control-line);
    background: transparent;
    border-radius: 3px;
    color: var(--muted);
    font-size: 12px;
  }
  .panel-status,
  .panel-empty {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
  }
  .panel-latest {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    min-height: 36px;
    padding: 6px 12px;
    background: var(--accent);
    color: var(--ink);
    border: 1px solid #e4ff9d;
    border-radius: 3px;
    font-size: 13px;
    white-space: nowrap;
  }
  @media (min-width: 1640px) {
    .overview.multiple-rows {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .overview.multiple-rows:not(.many-rooms) {
      grid-template-rows: minmax(190px, 1fr);
    }
  }
</style>
