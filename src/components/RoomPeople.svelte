<script>
  let { session } = $props();
  const account = $derived(session.currentAccount);
  const people = $derived.by(() => {
    session.roleRevision;
    return (account?.people || []).map((person) => ({
      name: person.name,
      superuser: session.store.isSuperuser(account.name, person.name),
    }));
  });
</script>

<aside id="room-people" class="room-people" aria-labelledby="people-title">
  <header>
    <h2 id="people-title">
      {account?.complete ? 'In this room' : 'Observed in this room'}
      <span>{account?.people.length || 0}</span>
    </h2>
    <button
      class="hide-people"
      aria-label="Hide room participants"
      title="Hide room participants"
      onclick={() => session.togglePeople()}>×</button
    >
  </header>
  {#if !session.online}<p class="people-note">
      The list may be out of date while disconnected.
    </p>{/if}
  <ul>
    {#each people as person (person.name)}
      <li>
        <button
          class:superuser={person.superuser}
          onclick={() => session.openPerson(person.name, [account.name])}>{person.name}</button
        >
      </li>
    {:else}<li class="people-note">No participants observed yet.</li>{/each}
  </ul>
</aside>

<style>
  .room-people {
    display: flex;
    flex-direction: column;
    flex: 0 0 232px;
    min-width: 0;
    min-height: 0;
    border-left: 1px solid var(--line);
    background: #20221c;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    padding: 8px 12px 8px 16px;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #c4cbb8;
  }
  h2 span {
    margin-left: 6px;
    color: var(--muted);
    font: 12px var(--mono);
  }
  .hide-people {
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 22px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 8px 12px;
    overflow: auto;
    scrollbar-width: thin;
  }
  li button {
    display: block;
    width: 100%;
    min-height: 36px;
    padding: 6px;
    background: transparent;
    border: 0;
    border-radius: 2px;
    text-align: left;
    overflow-wrap: anywhere;
  }
  li button:hover {
    background: var(--surface);
    color: var(--accent);
  }
  li button.superuser {
    color: #ffc477;
  }
  .people-note {
    color: var(--muted);
    padding: 4px 6px;
    font-size: 13px;
  }
  p.people-note {
    margin: 8px 12px 0;
  }
</style>
