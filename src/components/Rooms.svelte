<script>
  import Sheet from './Sheet.svelte';
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
  title="Rum & brugere"
  eyebrow="DINE BRUGERE"
  open={session.dialogs.rooms}
  onclose={() => session.closeDialog('rooms')}
>
  <p class="sheet-intro">
    Et overblik for hver af dine brugere. Deltagerlisten hentes ved rumskift og opdateres med ind-
    og udgange.
  </p>
  <div id="room-cards">
    {#each session.accounts as account (account.name)}
      <section class="room-card">
        <div class="room-card-header">
          <div class="room-card-copy">
            <strong>{account.name}</strong><span
              >{account.room
                ? account.room.name + (account.room.id != null ? ' · ' + account.room.id : '')
                : 'Rumnavn afventes'}</span
            >
          </div>
          <button class="soft-button" onclick={() => openChat(account.name)}>Åbn chat</button>
        </div>
        <details
          class="room-people"
          data-account={account.name}
          open={isExpanded(account)}
          ontoggle={(event) => (expanded[account.name] = event.currentTarget.open)}
        >
          <summary
            >{account.complete
              ? 'Deltagere'
              : account.room
                ? 'Observeret i rummet'
                : 'Observeret i samtalen'} · {account.people.length}</summary
          >
          {#if account.complete}<p class="snapshot-note">
              Deltagerliste fra rumskift {formatTime(account.roomSince)} · opdateres løbende
            </p>{/if}
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
                          ? 'Din bruger'
                          : person.source === 'snapshot'
                            ? 'Med ved rumskift'
                            : 'Senest set ' + formatTime(person.time)}</small
                      ></span
                    ></button
                  >
                </li>
              {/each}
            </ul>
          {:else}<p class="setting-note">
              Ingen brugere observeret endnu. Listen opdateres med nye beskeder og indgange.
            </p>{/if}
        </details>
      </section>
    {:else}<p class="setting-note">Dine brugere vises, når acidum sender sine faner.</p>{/each}
  </div>
  <p class="sheet-footnote">
    Hvis vi ikke har modtaget rumskiftets deltagerliste, vises kun observerede brugere. Ved afbrudt
    forbindelse kan listen være forældet.
  </p>
</Sheet>

<style>
  .sheet-intro {
    color: #b6bfaa;
    font-size: 12px;
    line-height: 1.65;
    margin: 0 0 18px;
  }
  .sheet-footnote {
    color: #a5b095;
    font-size: 11px;
    line-height: 1.6;
    margin: 20px 0 0;
  }
  .room-card {
    border: 1px solid #4a573b;
    border-radius: 3px;
    padding: 13px;
    margin-bottom: 10px;
    background: #2d3325;
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
    font: 11px/1.5 var(--mono);
    overflow-wrap: anywhere;
  }
  .room-people {
    padding-top: 11px;
    margin: 12px 0 0;
    border-top: 1px solid #4a573b;
  }
  .room-people > summary {
    min-height: 34px;
    color: #d2dfbf;
    cursor: pointer;
    font: 11px/1.7 var(--mono);
  }
  .snapshot-note {
    margin: 0 0 8px;
    color: #a6b591;
    font: 10px/1.6 var(--mono);
  }
  .people-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px 14px;
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
    min-height: 44px;
    padding: 7px 0;
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
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .person-copy small {
    color: #a5b295;
    font-size: 11px;
  }
  @media (max-width: 700px) {
    .room-card {
      padding: 12px;
    }
  }
</style>
