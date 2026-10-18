<script>
  import Sheet from './Sheet.svelte';
  let { session } = $props();
</script>

<Sheet
  id="message-dialog"
  title="Message"
  open={session.dialogs.message}
  onclose={() => session.closeDialog('message')}
>
  <p
    id="message-preview"
    class="message-preview"
    lang={session.messageTools.selected?.system ? 'da' : undefined}
  >
    {session.messageTools.selected?.text || ''}
  </p>
  <div class="sheet-actions">
    {#if session.messageTools.selected?.destination}
      <button
        id="follow-message"
        class="soft-button"
        disabled={!session.followAccount}
        onclick={() => session.followMessage()}>Follow as {session.followAccount}</button
      >
    {/if}
    <button id="copy-message" class="soft-button" onclick={() => session.messageTools.copy()}
      >Copy text</button
    ><button id="save-message" class="soft-button" onclick={() => session.messageTools.toggle()}
      >{session.messageTools.saved ? 'Remove from saved' : 'Save message'}</button
    >
  </div>
  <p id="message-action-status" class="setting-note" role="status">{session.messageTools.status}</p>
</Sheet>

<style>
  #follow-message {
    overflow-wrap: anywhere;
  }
  .message-preview {
    padding: 12px;
    border-left: 2px solid #a0b873;
    border-radius: 0;
    background: #2b3522;
    color: var(--text);
    font-size: var(--message-font, 16px);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .message-preview {
    margin: 0 0 18px;
    white-space: pre-wrap;
  }
</style>
