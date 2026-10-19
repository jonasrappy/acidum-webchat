<script>
  import Sheet from './Sheet.svelte';
  import Help from './Help.svelte';
  let { session } = $props();
</script>

<Sheet
  id="settings-dialog"
  title="Settings"
  open={session.dialogs.settings}
  onclose={() => session.closeDialog('settings')}
>
  <section class="settings-group">
    <h3>Appearance</h3>
    <Help label="About appearance"
      ><p>
        Text size is saved on this device. Room activity shows people entering or leaving rooms,
        changing rooms, and other chat events in the conversation. Your messages can use a subtle
        blue-grey marker, including messages from your other connected accounts. This choice is
        saved on this device.
      </p>
      {#if session.wide}<p>
          Desktop panels can have separate message fields with fixed senders, or one shared bar at
          the bottom where you choose the sender. This choice is saved on this device.
        </p>{/if}
      <p class="font-preview">An example message.</p></Help
    >
    <label class="text-size-label" for="text-size"
      >Text size <output id="text-size-value" for="text-size">{session.textSize} px</output></label
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
      ><span><strong>Show room activity</strong></span><input
        id="show-events"
        type="checkbox"
        checked={session.showEvents}
        onchange={(event) => session.setShowEvents(event.currentTarget.checked)}
      /></label
    >
    <label class="setting-row" for="highlight-own-messages"
      ><span><strong>Highlight my messages</strong></span><input
        id="highlight-own-messages"
        type="checkbox"
        checked={session.highlightOwnMessages}
        onchange={(event) => session.setHighlightOwnMessages(event.currentTarget.checked)}
      /></label
    >
    {#if session.wide}
      <fieldset class="desktop-composer-setting">
        <legend>Desktop message fields</legend>
        <label class="radio-choice" for="composer-panels">
          <input
            id="composer-panels"
            type="radio"
            name="desktop-composer"
            value="panels"
            checked={session.desktopComposer !== 'shared'}
            onchange={(event) => session.setDesktopComposer(event.currentTarget.value)}
          />
          <span>Under each chat</span>
        </label>
        <label class="radio-choice" for="composer-shared">
          <input
            id="composer-shared"
            type="radio"
            name="desktop-composer"
            value="shared"
            checked={session.desktopComposer === 'shared'}
            onchange={(event) => session.setDesktopComposer(event.currentTarget.value)}
          />
          <span>One bottom bar</span>
        </label>
      </fieldset>
    {/if}
  </section>
  <section class="settings-group">
    <h3>Message alerts</h3>
    <Help label="About message alerts"
      ><p>Trigger words are managed in the desktop app. The webchat follows its message markers.</p>
      <p>
        Notifications and sound require an active chat connection. On iPhone, add acidum to your
        Home Screen and open it from there to enable system notifications.
      </p></Help
    >
    <button
      id="enable-notifications"
      class="soft-button"
      onclick={() => session.notifications.toggle()}
      >{session.notifications.enabled ? 'Disable notifications' : 'Enable notifications'}</button
    >
    <p id="notification-status" class="setting-note" role="status">
      {session.notifications.status}
    </p>
    <label class="setting-row" for="notification-sound"
      ><span><strong>Sound for message alerts</strong></span><input
        id="notification-sound"
        type="checkbox"
        checked={session.notifications.sound}
        onchange={(event) => session.notifications.setSound(event.currentTarget.checked)}
      /></label
    >
  </section>
  <section class="settings-group">
    <h3>Chat</h3>
    <Help label="About this chat"
      ><p>Export saves the loaded and filtered conversation as a text file on your device.</p>
      <p>
        Tap a name to mention someone or see their messages. Tap a timestamp to copy or save a
        message. Drafts are saved separately for each account on this device.
      </p></Help
    >
    <button id="export-chat" class="soft-button" onclick={() => session.exportChat()}
      >Export loaded messages</button
    >
  </section>
  <section class="settings-group">
    <h3>History</h3>
    <Help label="About history"
      ><p>
        Save up to 10,000 messages locally in your browser. Scroll up in the conversation to load
        older saved messages.
      </p>
      <p>Turning storage off keeps existing saved messages until you delete them.</p>
      <p>
        The event log always keeps the latest 100 events locally, with no expiry. Saving or clearing
        chat history does not affect it.
      </p></Help
    >
    <label class="setting-row" for="save-history"
      ><span><strong>Save history</strong></span><input
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
      onclick={() => session.clearHistory()}>Clear saved history</button
    >
  </section>
  <section class="settings-group settings-connection-group">
    <h3>Connection</h3>
    <Help label="About connection and login"
      ><p>
        The desktop app must keep running with webchat enabled. The chat reconnects automatically
        after network errors.
      </p>
      <p>
        Disconnecting and removing your login clears the saved webchat link from this browser. Saved
        history is kept.
      </p></Help
    >
    <div class="settings-connection">
      <span id="settings-status">{session.status}</span><button
        id="settings-reconnect"
        class="soft-button"
        onclick={() => session.reconnect()}>Reconnect</button
      >
    </div>
    <button id="mobile-exit" class="soft-button danger" onclick={() => session.disconnect()}
      >Disconnect and remove login</button
    >
  </section>
</Sheet>

<style>
  .settings-group {
    position: relative;
    padding: 20px 0;
    border-bottom: 1px solid var(--line);
    --help-top: 8px;
  }
  .settings-group:first-of-type {
    padding-top: 4px;
    --help-top: -8px;
  }
  .settings-group h3 {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--muted);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.2px;
    margin: 0 0 14px;
  }
  .settings-group > .soft-button {
    margin: 0 5px 5px 0;
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    cursor: pointer;
  }
  .desktop-composer-setting {
    display: flex;
    flex-wrap: wrap;
    gap: 0 24px;
    border: 0;
    border-top: 1px solid var(--line);
    padding: 10px 0 0;
    margin: 12px 0 0;
    min-width: 0;
  }
  .desktop-composer-setting legend {
    padding: 0 8px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
  .radio-choice {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    cursor: pointer;
  }
  .radio-choice input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--accent);
  }
  .setting-row > span {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .setting-row strong {
    font-size: 15px;
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
    font-size: 13px;
    overflow-wrap: anywhere;
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
    font-size: 15px;
    font-weight: 600;
    margin: 9px 0 4px;
  }
  .text-size-label output {
    color: var(--accent);
    font: 13px/1.5 var(--mono);
  }
  #text-size {
    display: block;
    width: 100%;
    height: 44px;
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
    .settings-connection {
      gap: 8px;
    }
  }
</style>
