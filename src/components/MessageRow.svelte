<script>
  let { row, onopen } = $props();
</script>

<article
  class="message"
  class:system={row.message.system}
  class:private={row.message.private}
  class:attention={row.attention}
  data-id={row.message.id}
>
  <div class="message-meta">
    <button
      class="message-time"
      type="button"
      aria-label={row.time + ' · Beskedhandlinger'}
      onclick={() => onopen(row.message)}><time datetime={row.datetime}>{row.time}</time></button
    >
    <span class="saved-marker" hidden={!row.saved}>★</span>
  </div>
  {#if row.message.type === 'part' && row.message.destination}
    <button
      class="message-content movement followable"
      type="button"
      aria-label={row.message.text + ' · Beskedhandlinger'}
      onclick={() => onopen(row.message)}
      ><span class="movement-icon leave" aria-hidden="true">←</span><span class="message-text"
        >{row.message.text}</span
      ></button
    >
  {:else}
    <div class="message-content" class:movement={row.movement}>
      {#if row.movement}<span
          class="movement-icon"
          class:enter={row.entering}
          class:leave={!row.entering}
          aria-hidden="true">{row.entering ? '→' : '←'}</span
        >{/if}
      <p class="message-text">
        {#each row.parts as part}{#if part.href}<a
              href={part.href}
              target="_blank"
              rel="noopener noreferrer">{part.text}</a
            >{:else}{part.text}{/if}{/each}
      </p>
    </div>
  {/if}
</article>

<style>
  .message-time {
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    text-align: left;
  }
  .message {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--time-gutter);
    gap: 9px;
    padding: 2px 0;
  }
  .message-content {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
  }
  .message-text {
    margin: 0;
    color: #e1e5d8;
    font-size: var(--message-font, 16px);
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .message-text a {
    color: #d2e9aa;
    text-decoration: underline;
    overflow-wrap: anywhere;
  }
  .message.private .message-text {
    color: #d7cbea;
  }
  .message.system .message-text {
    color: #a6b09a;
    font-size: max(10px, calc(var(--message-font, 16px) - 4px));
    line-height: 1.5;
  }
  .message-content.movement {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .followable {
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }
  .followable:hover .message-text {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .movement .message-text {
    flex: 1;
    min-width: 0;
  }
  .movement-icon {
    flex: none;
    width: 17px;
    font-size: max(12px, calc(var(--message-font, 16px) - 1px));
    line-height: 1.25;
    font-weight: 700;
    text-align: center;
  }
  .movement-icon.enter {
    color: #b6de81;
  }
  .movement-icon.leave {
    color: #f5a28c;
  }
  .message-meta {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 2px;
    grid-column: 2;
    grid-row: 1;
    padding-top: 2px;
    white-space: nowrap;
  }
  .message-time,
  .message time {
    color: #a0a995;
    font: clamp(10px, calc(var(--message-font, 16px) - 7px), 15px)/1.3 var(--mono);
    font-variant-numeric: tabular-nums;
  }
  .message-time {
    min-height: 18px;
  }
  .message-time:hover,
  .message-time:hover time {
    color: var(--accent);
  }
  .message.system .message-meta {
    padding-top: 1px;
  }
  .message.attention .message-text {
    color: #f1f9da;
    background: #424e29;
    border-left: 2px solid var(--accent);
    border-radius: 0 2px 2px 0;
    padding: 2px 7px;
  }
  .saved-marker {
    position: absolute;
    top: 3px;
    right: -7px;
    color: var(--accent);
    font-size: 9px;
    line-height: 1;
    pointer-events: none;
  }
</style>
