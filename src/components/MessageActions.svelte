<script>
  import Sheet from './Sheet.svelte';
  let { session } = $props();
</script>

<Sheet
  id="message-dialog"
  title="Besked"
  open={session.dialogs.message}
  onclose={() => session.closeDialog('message')}
>
  <p id="message-preview" class="message-preview">{session.messageTools.selected?.text || ''}</p>
  <div class="sheet-actions">
    <button id="copy-message" class="soft-button" onclick={() => session.messageTools.copy()}
      >Kopiér tekst</button
    ><button id="save-message" class="soft-button" onclick={() => session.messageTools.toggle()}
      >{session.messageTools.saved ? 'Fjern fra gemte' : 'Gem besked'}</button
    >
  </div>
  <p id="message-action-status" class="setting-note" role="status">{session.messageTools.status}</p>
</Sheet>

<style>
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
