<script>
  let { id, title, eyebrow = '', open, onclose, children, tools } = $props();
  let dialog;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('.sheet-body').scrollTop = 0;
    } else if (!open && dialog.open) dialog.close();
  });

  function closed() {
    for (const help of dialog.querySelectorAll('.settings-help[open]')) help.open = false;
    onclose();
  }

  function backdrop(event) {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [
      ...dialog.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]'),
    ].filter(
      (node) => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length,
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus({ preventScroll: true });
    }
  }
</script>

<dialog
  bind:this={dialog}
  {id}
  class="sheet"
  aria-modal="true"
  aria-labelledby={id.replace('-dialog', '-title')}
  onclose={closed}
  onclick={backdrop}
  onkeydown={trapFocus}
>
  <header class="sheet-header">
    <div>
      {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
      <h2 id={id.replace('-dialog', '-title')}>{title}</h2>
    </div>
    <div class="sheet-tools">
      {#if tools}{@render tools()}{/if}
      <button class="icon-button close-sheet" aria-label="Close" onclick={() => dialog.close()}
        >×</button
      >
    </div>
  </header>
  <div class="sheet-body">{@render children()}</div>
</dialog>

<style>
  .sheet {
    width: min(540px, calc(100% - 32px));
    max-height: 85dvh;
    padding: 0;
    overflow: hidden;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    color: var(--text);
    background: var(--panel);
    border: 1px solid #68705b;
    border-radius: 8px;
    box-shadow: 0 16px 60px #0006;
  }
  .sheet[open] {
    display: flex;
    flex-direction: column;
  }
  .sheet::backdrop {
    background: #090b08bf;
  }
  .sheet-body {
    min-height: 0;
    padding: 16px 24px 24px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scroll-padding-block: 12px;
  }
  .sheet-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: none;
    min-height: 76px;
    padding: 16px 20px 16px 24px;
    border-bottom: 1px solid var(--line);
  }
  .sheet-header > div:first-child {
    min-width: 0;
  }
  .sheet-header h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 750;
    letter-spacing: -0.5px;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .sheet-header .eyebrow {
    color: #c4d3a8;
  }
  .close-sheet {
    font-size: 28px;
    line-height: 1;
  }
  .sheet-tools {
    display: flex;
    align-items: center;
    flex: none;
  }

  @media (max-width: 700px) {
    .sheet {
      position: fixed;
      top: auto;
      bottom: var(--viewport-bottom, 0px);
      width: 100%;
      max-width: none;
      max-height: calc(var(--app-height, 100dvh) - max(12px, env(safe-area-inset-top)));
      margin: 0;
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 10px 10px 0 0;
      box-shadow: none;
    }
    .sheet-header {
      min-height: 68px;
      padding: 12px 12px 12px 20px;
    }
    .sheet-header h2 {
      font-size: 22px;
    }
    .sheet-body {
      padding: 16px 20px max(20px, env(safe-area-inset-bottom));
    }

    :global(.keyboard-open) .sheet-body {
      padding-bottom: 16px;
    }
  }
</style>
