<script>
  import Sheet from './Sheet.svelte';
  import Help from './Help.svelte';
  let { session } = $props();
</script>

<Sheet
  id="settings-dialog"
  title="Indstillinger"
  open={session.dialogs.settings}
  onclose={() => session.closeDialog('settings')}
>
  <section class="settings-group">
    <h3>Visning</h3>
    <Help label="Om visning"
      ><p>
        Tekststørrelsen huskes på denne enhed. Ind- og udgange viser rumskift og andre hændelser i
        samtalen.
      </p>
      <p class="font-preview">Eksempel på en besked.</p></Help
    >
    <label class="text-size-label" for="text-size"
      >Tekststørrelse <output id="text-size-value" for="text-size">{session.textSize} px</output
      ></label
    >
    <input
      id="text-size"
      type="range"
      min="10"
      max="30"
      value={session.textSize}
      step="1"
      oninput={(event) => session.setTextSize(event.currentTarget.value)}
    />
    <label class="setting-row" for="show-events"
      ><span><strong>Vis ind- og udgange</strong></span><input
        id="show-events"
        type="checkbox"
        checked={session.showEvents}
        onchange={(event) => session.setShowEvents(event.currentTarget.checked)}
      /></label
    >
  </section>
  <section class="settings-group">
    <h3>Beskedalarmer</h3>
    <Help label="Om beskedalarmer"
      ><p>Triggerord styres i programmet. Webchatten følger de medsendte markeringer.</p>
      <p>
        Notifikationer og lyd kræver en aktiv chatforbindelse. På iPhone: føj acidum til
        hjemmeskærmen og åbn derfra for at aktivere systemnotifikationer.
      </p></Help
    >
    <button
      id="enable-notifications"
      class="soft-button"
      onclick={() => session.notifications.toggle()}
      >{session.notifications.enabled ? 'Slå notifikationer fra' : 'Aktivér notifikationer'}</button
    >
    <p id="notification-status" class="setting-note" role="status">
      {session.notifications.status}
    </p>
    <label class="setting-row" for="notification-sound"
      ><span><strong>Lyd ved beskedalarm</strong></span><input
        id="notification-sound"
        type="checkbox"
        checked={session.notifications.sound}
        onchange={(event) => session.notifications.setSound(event.currentTarget.checked)}
      /></label
    >
  </section>
  <section class="settings-group">
    <h3>Samtale</h3>
    <Help label="Om samtalen"
      ><p>Eksport gemmer den indlæste og filtrerede samtale som en tekstfil på din enhed.</p>
      <p>
        Tryk på et navn for at omtale personen eller se personens beskeder. Tryk på et tidspunkt for
        at kopiere eller gemme en besked. Kladder huskes separat for hver bruger på denne enhed.
      </p></Help
    >
    <button id="export-chat" class="soft-button" onclick={() => session.exportChat()}
      >Eksportér indlæste beskeder</button
    >
  </section>
  <section class="settings-group">
    <h3>Historik</h3>
    <Help label="Om historik"
      ><p>
        Gem op til 10.000 beskeder lokalt i din browser. Scroll op i samtalen for at hente ældre
        gemte beskeder.
      </p>
      <p>Slår du lagring fra, bevares allerede gemte beskeder, indtil du sletter dem.</p></Help
    >
    <label class="setting-row" for="save-history"
      ><span><strong>Gem historik</strong></span><input
        id="save-history"
        type="checkbox"
        checked={session.history.enabled}
        onchange={(event) => session.setHistory(event.currentTarget.checked)}
      /></label
    >
    <button
      id="clear-history"
      class="soft-button danger"
      hidden={!session.history.enabled}
      onclick={() => session.clearHistory()}>Slet gemt historik</button
    >
  </section>
  <section class="settings-group settings-connection-group">
    <h3>Forbindelse</h3>
    <Help label="Om forbindelse og login"
      ><p>
        Programmet på din computer skal fortsat køre med webchat slået til. Ved netværksfejl prøver
        chatten automatisk at forbinde igen.
      </p>
      <p>
        “Afbryd og fjern login” fjerner dit gemte webchat-link fra denne browser. Gemt historik
        bevares.
      </p></Help
    >
    <div class="settings-connection">
      <span id="settings-status">{session.status}</span><button
        id="settings-reconnect"
        class="soft-button"
        onclick={() => session.reconnect()}>Forbind igen</button
      >
    </div>
    <button id="mobile-exit" class="soft-button danger" onclick={() => session.disconnect()}
      >Afbryd og fjern login</button
    >
  </section>
</Sheet>

<style>
  .settings-group {
    position: relative;
    padding: 18px 0;
    border-bottom: 1px solid #414c34;
  }
  .settings-group:first-of-type {
    padding-top: 7px;
    --help-top: -3px;
  }
  .settings-group h3 {
    display: flex;
    gap: 8px;
    align-items: center;
    color: #c4d4a8;
    font: 10px/1.5 var(--mono);
    letter-spacing: 1.2px;
    text-transform: uppercase;
    margin: 0 0 14px;
  }
  .settings-group h3::before {
    content: '';
    width: 5px;
    height: 5px;
    background: var(--accent);
  }
  .settings-group > .soft-button {
    margin: 0 5px 5px 0;
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 48px;
    cursor: pointer;
  }
  .setting-row > span {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .setting-row strong {
    font-size: 14px;
    font-weight: 600;
  }

  .setting-row input {
    appearance: none;
    position: relative;
    flex: none;
    width: 38px;
    height: 23px;
    min-width: 38px;
    margin: 0;
    border: 1px solid #778363;
    border-radius: 3px;
    background: #343e29;
    cursor: pointer;
  }
  .setting-row input::before {
    content: '';
    position: absolute;
    left: 3px;
    top: 3px;
    width: 15px;
    height: 15px;
    border-radius: 1px;
    background: #a0af8c;
  }
  .setting-row input:checked {
    border-color: var(--accent);
    background: var(--accent);
  }
  .setting-row input:checked::before {
    left: 18px;
    background: var(--ink);
  }
  .settings-group h3 {
    padding-right: 36px;
  }
  #notification-status:empty {
    display: none;
  }
  .settings-connection-group {
    border-bottom: 0;
    padding-bottom: 0;
  }
  .settings-connection-group #mobile-exit {
    margin-top: 10px;
    margin-right: 0;
  }
  .settings-connection {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--muted);
    font: 11px/1.5 var(--mono);
  }
  #mobile-exit {
    display: flex;
    width: 100%;
  }
  .text-size-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 14px;
    font-weight: 600;
    margin: 9px 0 4px;
  }
  .text-size-label output {
    color: var(--accent);
    font: 12px/1.5 var(--mono);
  }
  #text-size {
    display: block;
    width: 100%;
    height: 38px;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .font-preview {
    padding: 12px;
    border-left: 2px solid #a0b873;
    border-radius: 0;
    background: #2b3522;
    color: var(--text);
    font-size: var(--message-font, 16px);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .font-preview {
    margin: 5px 0 14px;
  }
  @media (max-width: 700px) {
    .settings-group {
      padding-block: 17px;
    }
    .settings-connection {
      font-size: 11px;
    }
  }
</style>
