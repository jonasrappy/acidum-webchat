<script>
  import MessageGroup from './MessageGroup.svelte';
  let { session } = $props();
  const attach = (node) => session.attachTimeline(node);
</script>

<div
  id="timeline"
  class="timeline"
  use:attach
  onscroll={() => session.onScroll()}
  tabindex="0"
  role="tabpanel"
  aria-live="off"
  aria-labelledby="view-title"
>
  <button
    id="older"
    class="older"
    hidden={!session.hasOlder}
    disabled={session.history.loading}
    onclick={() => session.loadOlder()}>Vis ældre beskeder</button
  >
  <p id="history-status" class="history-status" role="status">{session.history.status}</p>
  <div id="messages">
    {#each session.timeline.groups as group (group.key)}<MessageGroup {group} {session} />{/each}
  </div>
  <div id="empty" class="empty" hidden={session.timeline.groups.length > 0}>
    <span aria-hidden="true">◌</span>
    <h2>Her starter samtalen</h2>
    <p id="empty-text">{session.emptyText}</p>
  </div>
</div>
<button
  id="new-messages"
  class="new-messages"
  hidden={!session.notice}
  onclick={() => {
    session.nearBottom = true;
    session.refresh();
  }}>Nye beskeder ↓</button
>

<style>
  #messages {
    max-width: 1100px;
    margin-inline: auto;
  }
  .timeline {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overflow-anchor: none;
    overscroll-behavior: contain;
    padding: 12px 24px 18px;
    scrollbar-width: thin;
    scrollbar-color: #505744 transparent;
  }
  .older {
    display: block;
    min-height: 38px;
    padding: 8px 13px;
    margin: 0 auto 12px;
    background: var(--surface);
    border: 1px solid #505b41;
    border-radius: 3px;
    color: var(--text);
    font-size: 12px;
  }
  .history-status {
    margin: 0 0 12px;
    text-align: center;
    color: var(--muted);
    font: 11px/1.6 var(--mono);
  }
  .history-status:empty {
    display: none;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 150px;
    text-align: center;
    color: var(--muted);
  }
  .empty > span {
    font-size: 38px;
    color: var(--accent);
  }
  .empty h2 {
    margin: 14px 0 0;
    color: var(--text);
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.3px;
  }
  .empty p {
    max-width: 320px;
    font-size: 12px;
    line-height: 1.7;
  }
  .new-messages {
    position: absolute;
    z-index: 3;
    bottom: 104px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 85%;
    padding: 10px 14px;
    border: 1px solid #e4ff9d;
    border-radius: 3px;
    background: var(--accent);
    color: var(--ink);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
    box-shadow: 3px 3px 0 #0006;
  }
  @media (max-width: 1000px) and (min-width: 701px) {
    .timeline {
      padding-inline: 18px;
    }
  }
  @media (max-width: 700px) {
    .timeline {
      padding: 7px 10px 12px;
    }
    .new-messages {
      bottom: 127px;
    }
    .empty h2 {
      font-size: 16px;
    }
    .empty p {
      font-size: 12px;
    }
    :global(.keyboard-open) .new-messages {
      bottom: 72px;
    }
  }
</style>
