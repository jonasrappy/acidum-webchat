<script>
  let { session } = $props();
</script>

<button
  id="alert-banner"
  class="alert-banner"
  aria-live="polite"
  aria-atomic="true"
  hidden={!session.alert}
  onclick={() => session.alert && session.openAlert(session.alert.account)}
>
  <strong id="alert-title"
    >{session.alert
      ? session.alert.account + ' · ' + (session.alert.name || 'Message alert')
      : ''}</strong
  >
  <span id="alert-body">{session.alert?.text || ''}</span>
</button>

<style>
  .alert-banner {
    position: fixed;
    z-index: 20;
    top: calc(var(--viewport-top, 0px) + 10px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: min(440px, calc(100% - 24px));
    padding: 12px 14px;
    border: 1px solid var(--accent);
    border-left-width: 4px;
    border-radius: 3px;
    color: var(--text);
    background: #354526;
    text-align: left;
    box-shadow: 4px 4px 0 #0007;
  }
  .alert-banner strong {
    color: var(--accent);
    font: 12px/1.5 var(--mono);
  }
  .alert-banner > span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 16px;
    line-height: 1.4;
  }
</style>
