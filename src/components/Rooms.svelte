<script>
  import Sheet from './Sheet.svelte';
  import Help from './Help.svelte';
  import { formatTime } from '../lib/format.js';
  let { session } = $props();
  let expanded = $state({});

  function isExpanded(account) {
    return (
      expanded[account.name] ?? (session.active === account.name || session.accounts.length === 1)
    );
  }

  function openChat(name) {
    session.choose(name);
    session.closeDialog('rooms');
  }
</script>

<Sheet
  id="rooms-dialog"
  title="Rooms & people"
  open={session.dialogs.rooms}
  onclose={() => session.closeDialog('rooms')}
>
  {#snippet tools()}
    <Help label="About rooms and participants" inline>
      <p>The participant list loads when you enter a room and updates as people join and leave.</p>
      <p>
        “Observed” means a full participant list has not arrived yet. The list may be out of date
        while disconnected.
      </p>
    </Help>
  {/snippet}
  <div id="room-cards">
    {#each session.accounts as account (account.name)}
      <section class="room-card">
        <div class="room-card-header">
          <div class="room-card-copy">
            <strong>{account.name}</strong><span
              >{account.room
                ? account.room.name + (account.room.id != null ? ' · ' + account.room.id : '')
                : 'Waiting for room name'}</span
            >
          </div>
          <button
            class="soft-button"
            aria-label={`Open chat as ${account.name}`}
            onclick={() => openChat(account.name)}>Open chat</button
          >
        </div>
        <details
          class="room-people"
          data-account={account.name}
          open={isExpanded(account)}
          ontoggle={(event) => (expanded[account.name] = event.currentTarget.open)}
        >
          <summary
            ><span
              >{account.complete
                ? 'Participants'
                : account.room
                  ? 'Observed in this room'
                  : 'Observed in this chat'}</span
            ><span class="people-count">{account.people.length}</span></summary
          >
          {#if account.people.length}
            <ul class="people-list">
              {#each account.people as person (person.name)}
                <li>
                  <button
                    class="person-button"
                    onclick={() => session.openPerson(person.name, [account.name])}
                    ><span class="person-copy"
                      ><strong>{person.name}</strong><small
                        >{person.name === account.name
                          ? 'Your account'
                          : person.source === 'snapshot'
                            ? ''
                            : 'Last seen ' + formatTime(person.time)}</small
                      ></span
                    ></button
                  >
                </li>
              {/each}
            </ul>
          {:else}<p class="setting-note">No participants observed yet.</p>{/if}
        </details>
      </section>
    {:else}<p class="setting-note">Your accounts appear when acidum sends its tabs.</p>{/each}
  </div>
</Sheet>

<style>
  .room-card {
    border: 1px solid #515847;
    border-radius: 3px;
    padding: 13px;
    margin-bottom: 10px;
    background: #2a2e24;
  }
  .room-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .room-card-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .room-card-copy strong {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.3px;
    overflow-wrap: anywhere;
  }
  .room-card-copy > span {
    color: #bdcaa8;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .room-people {
    margin: 12px 0 0;
    border-top: 1px solid #515847;
  }
  .room-people > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    color: #d2dfbf;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    list-style: none;
  }
  .room-people > summary::-webkit-details-marker {
    display: none;
  }
  .room-people > summary::before {
    content: '';
    width: 7px;
    height: 7px;
    flex: none;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
    margin-right: 4px;
  }
  .room-people[open] > summary::before {
    transform: rotate(45deg) translateY(-2px);
  }
  .people-count {
    margin-left: auto;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .people-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .people-list li {
    min-width: 0;
    border-bottom: 1px solid #3e4931;
  }
  .person-button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 48px;
    padding: 8px 0;
    background: transparent;
    border: 0;
    color: var(--text);
    text-align: left;
  }
  .person-button:hover .person-copy strong {
    color: var(--accent);
  }
  .person-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .person-copy strong {
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .person-copy small {
    color: #a5b295;
    font-size: 12px;
  }
  .person-copy small:empty {
    display: none;
  }
  @media (max-width: 700px) {
    .room-card {
      padding: 12px;
    }
  }
</style>
