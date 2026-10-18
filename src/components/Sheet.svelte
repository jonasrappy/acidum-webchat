<script>
  let { id, title, eyebrow = '', open, onclose, children } = $props();
  let dialog;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
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
</script>

<dialog
  bind:this={dialog}
  {id}
  class="sheet"
  aria-labelledby={id.replace('-dialog', '-title')}
  onclose={closed}
  onpointerdown={backdrop}
>
  <div class="sheet-handle" aria-hidden="true"></div>
  <header class="sheet-header">
    <div>
      {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
      <h2 id={id.replace('-dialog', '-title')}>{title}</h2>
    </div>
    <button class="icon-button close-sheet" aria-label="Luk" onclick={() => dialog.close()}
      >×</button
    >
  </header>
  {@render children()}
</dialog>

<style>
  .sheet {
    width: min(520px, calc(100% - 32px));
    max-height: 85dvh;
    padding: 24px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    color: var(--text);
    background: #262920;
    border: 1px solid #68774e;
    border-top: 3px solid var(--accent);
    border-radius: 4px;
    box-shadow: 8px 8px 0 #0005;
  }
  .sheet::backdrop {
    background: #080b06c9;
  }
  .sheet-handle {
    display: none;
  }
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 17px;
  }
  .sheet-header h2 {
    margin: 0;
    font-size: 25px;
    font-weight: 750;
    letter-spacing: -0.8px;
    line-height: 1.1;
  }
  .sheet-header .eyebrow {
    color: #c4d3a8;
  }
  .close-sheet {
    align-self: flex-start;
    font-size: 28px;
    line-height: 1;
  }

  @media (max-width: 700px) {
    .sheet {
      position: fixed;
      top: auto;
      bottom: var(--viewport-bottom, 0px);
      width: 100%;
      max-width: none;
      max-height: calc(var(--app-height, 100dvh) - 16px);
      margin: 0;
      padding: 10px 18px max(18px, env(safe-area-inset-bottom));
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 6px 6px 0 0;
      box-shadow: none;
    }
    .sheet-handle {
      display: block;
      width: 30px;
      height: 3px;
      margin: 0 auto 18px;
      background: #718454;
      border-radius: 1px;
    }
    .sheet-header h2 {
      font-size: 25px;
    }
    .sheet .close-sheet {
      width: 40px;
      height: 40px;
    }

    :global(.keyboard-open) .sheet {
      padding-bottom: 16px;
    }
  }
</style>
