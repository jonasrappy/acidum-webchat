<script>
  import Sheet from './Sheet.svelte';
  let { session } = $props();
</script>

<Sheet
  id="person-dialog"
  title={session.selectedPerson?.name || ''}
  open={session.dialogs.person}
  onclose={() => session.closeDialog('person')}
>
  <p id="person-account" class="eyebrow">{session.selectedPerson?.account || ''}</p>
  <div class="sheet-actions">
    <button id="person-mention" class="soft-button" onclick={() => session.mentionPerson()}
      >Omtal i samtalen</button
    ><button id="person-messages" class="soft-button" onclick={() => session.filterPerson()}
      >Se personens beskeder</button
    >
  </div>
</Sheet>
