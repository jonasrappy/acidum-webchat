<script>
  let { label, children } = $props();
</script>

<details class="settings-help">
  <summary aria-label={label}><span aria-hidden="true">?</span></summary>
  <div class="settings-help-text">{@render children()}</div>
</details>

<style>
  .settings-help > summary {
    position: absolute;
    top: var(--help-top, 8px);
    right: 0;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    color: var(--muted);
    cursor: pointer;
    list-style: none;
  }
  .settings-help > summary::-webkit-details-marker {
    display: none;
  }
  .settings-help > summary::marker {
    content: '';
  }
  .settings-help > summary span {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: 1px solid currentColor;
    border-radius: 50%;
    font: 600 11px/1 var(--mono);
  }
  .settings-help > summary:hover,
  .settings-help[open] > summary {
    color: var(--accent);
  }
  .settings-help-text {
    padding: 9px 11px;
    margin: 0 0 12px;
    background: #2b3522;
    border-left: 2px solid #a0b873;
    color: #c4cdb7;
    font-size: 12px;
    line-height: 1.65;
  }
  .settings-help-text :global(p) {
    margin: 0 0 9px;
  }
  .settings-help-text :global(p):last-child {
    margin-bottom: 0;
  }
  .settings-help-text :global(.font-preview) {
    padding: 7px 0 0;
    border: 0;
    background: transparent;
  }
</style>
