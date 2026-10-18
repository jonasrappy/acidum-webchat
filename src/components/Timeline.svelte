<script>
  import MessageGroup from './MessageGroup.svelte';
  let { session } = $props();
  const attach = (node) => session.attachTimeline(node);
</script>

<div class="conversation">
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
      <h2>
        {session.query || session.person || session.mode === 'private'
          ? 'Ingen beskeder fundet'
          : session.logOnly
            ? 'Ingen hændelser endnu'
            : 'Her starter samtalen'}
      </h2>
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
</div>

<style>
  .conversation {
    display: flex;
    position: relative;
    flex: 1;
    min-height: 0;
  }
  #messages {
    width: 100%;
    max-width: var(--content-width);
    flex: none;
    margin-inline: auto;
  }
  .timeline {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overflow-anchor: none;
    overscroll-behavior: contain;
    padding: 16px var(--gutter);
    scroll-padding-block: 12px;
    scrollbar-width: thin;
    scrollbar-color: #505744 transparent;
  }
  .older {
    display: block;
    flex: none;
    min-height: 44px;
    padding: 8px 13px;
    margin: 0 auto 12px;
    background: var(--surface);
    border: 1px solid #505b41;
    border-radius: 3px;
    color: var(--text);
    font-size: 14px;
  }
  .history-status {
    margin: 0 0 12px;
    text-align: center;
    color: var(--muted);
    flex: none;
    font-size: 13px;
  }
  .history-status:empty {
    display: none;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
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
    font-size: 14px;
    line-height: 1.7;
  }
  .new-messages {
    position: absolute;
    z-index: 3;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 85%;
    min-height: 44px;
    padding: 10px 14px;
    border: 1px solid #e4ff9d;
    border-radius: 3px;
    background: var(--accent);
    color: var(--ink);
    font-size: 14px;
    font-weight: 650;
    white-space: nowrap;
    box-shadow: 3px 3px 0 #0006;
  }
  @media (max-width: 700px) {
    .timeline {
      padding: 7px 10px 12px;
    }
    .empty h2 {
      font-size: 16px;
    }
    .empty p {
      font-size: 14px;
    }
  }
</style>
