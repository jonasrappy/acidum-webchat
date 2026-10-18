<script>
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { mentionQuery, mentionSuggestions, completeMention } from '../lib/mentions.js';
  let { session } = $props();
  let input;
  let focused = $state(false);
  let caret = $state(0);
  let selected = $state(-1);
  let dismissed = $state('');
  let query = $derived(focused ? mentionQuery(session.composer.text, caret) : null);
  let queryKey = $derived(query ? `${query.start}:${query.end}:${query.prefix}` : '');
  let names = $derived(
    query && dismissed !== queryKey ? mentionSuggestions(session.presentNames(), query) : [],
  );
  let expanded = $derived(names.length > 0);
  let selectedIndex = $derived(Math.min(selected, names.length - 1));
  let activeOption = $derived(
    expanded && selectedIndex >= 0 ? 'mention-option-' + selectedIndex : undefined,
  );

  function changed() {
    caret = input.selectionStart ?? session.composer.text.length;
    selected = -1;
    dismissed = '';
    session.composer.changed();
  }

  async function complete(index) {
    if (!names[index]) return;
    const completion = completeMention(session.composer.text, query, names[index]);
    if (!completion) {
      session.composer.error = 'Der er ikke plads til navnet inden for 100 tegn.';
      return;
    }
    session.composer.text = completion.text;
    caret = completion.caret;
    selected = -1;
    session.composer.save();
    await tick();
    input.focus({ preventScroll: true });
    input.setSelectionRange(caret, caret);
  }

  function keydown(event) {
    if (event.isComposing || !expanded) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissed = queryKey;
      selected = -1;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selected =
        event.key === 'ArrowDown'
          ? (selected + 1) % names.length
          : selected < 0
            ? names.length - 1
            : (selected + names.length - 1) % names.length;
      tick().then(() => {
        const option = document.getElementById('mention-option-' + selected);
        const list = document.getElementById('mention-suggestions');
        if (!option || !list) return;
        if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
        else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight)
          list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
      });
    } else if ((event.key === 'Enter' || event.key === 'Tab') && selectedIndex >= 0) {
      event.preventDefault();
      complete(selectedIndex);
    }
  }

  function moved(event) {
    if (
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')
    )
      changed();
  }

  function send(event) {
    event.preventDefault();
    session.send();
    input.focus({ preventScroll: true });
    caret = input.selectionStart ?? session.composer.text.length;
  }
</script>

<footer class="composer-wrap">
  <div id="mention-menu" class="mention-menu" hidden={!expanded}>
    <p id="mention-caption">
      {expanded ? (session.rosterComplete() ? 'I rummet' : 'Observerede brugere') : ''}
    </p>
    <div id="mention-suggestions" role="listbox" aria-label="Foreslåede brugere">
      {#each names as name, index (name)}<button
          id={'mention-option-' + index}
          class="mention-option"
          type="button"
          tabindex="-1"
          role="option"
          aria-selected={index === selectedIndex}
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => complete(index)}>{name}</button
        >{/each}
    </div>
  </div>
  <form id="composer" onsubmit={send}>
    <select
      id="send-as"
      value={session.composer.account}
      onchange={(event) => {
        session.setSendAs(event.currentTarget.value);
        selected = -1;
        dismissed = '';
      }}
      aria-label="Send som"
      title="Send som"
      ><option value="">Vælg bruger</option
      >{#each session.accounts as account (account.name)}<option value={account.name}
          >{account.name}</option
        >{/each}</select
    >
    <input
      id="message"
      bind:this={input}
      bind:value={session.composer.text}
      oninput={changed}
      onfocus={() => {
        focused = true;
        caret = input.selectionStart ?? session.composer.text.length;
      }}
      onblur={() => (focused = false)}
      onclick={changed}
      onkeydown={keydown}
      onkeyup={moved}
      placeholder="Skriv en besked…"
      aria-label="Besked"
      aria-describedby={session.composer.error ? 'send-error' : undefined}
      role="combobox"
      aria-autocomplete="list"
      aria-controls="mention-suggestions"
      aria-expanded={expanded}
      aria-activedescendant={activeOption}
      maxlength="100"
      autocomplete="off"
      disabled={!session.composer.account}
    />
    <span
      id="message-limit"
      class="message-limit"
      hidden={session.composer.text.length < 80}
      aria-live="polite">{session.composer.text.length}/100</span
    >
    <button
      id="send"
      class="send-button"
      type="submit"
      aria-label="Send besked"
      disabled={!session.composer.account || !session.online || !session.composer.text.trim()}
      ><Icon name="send" /></button
    >
  </form>
  <p id="send-error" class="error" role="alert">{session.composer.error}</p>
</footer>

<style>
  .composer-wrap {
    position: relative;
    z-index: 2;
    flex: none;
    padding: 10px var(--gutter);
    background: #20211c;
    border-top: 1px solid var(--line);
  }
  #composer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 54px;
    max-width: var(--content-width);
    margin-inline: auto;
    padding: 5px 6px;
    border: 1px solid var(--control-line);
    border-radius: 3px;
    background: #292e23;
  }
  #composer:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  #send-as {
    flex: none;
    max-width: min(28%, 140px);
    min-height: 44px;
    padding: 8px 6px;
    border: 0;
    border-right: 1px solid #4b583b;
    border-radius: 0;
    color: var(--accent);
    background: transparent;
    font-size: 16px;
    text-overflow: ellipsis;
  }
  #send-as option {
    background: var(--panel);
    color: var(--text);
  }
  #message {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 8px 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: max(16px, var(--message-font, 16px));
    line-height: 1.35;
  }
  #message:focus {
    outline: 0;
  }
  #message::placeholder {
    color: #abb69c;
  }
  .send-button {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    padding: 8px;
    border: 0;
    border-radius: 2px;
    background: var(--accent);
    color: var(--ink);
  }
  .send-button:hover {
    background: #e7ff97;
  }
  .send-button :global(svg) {
    width: 22px;
    height: 22px;
    stroke-width: 2;
  }
  .message-limit {
    flex: none;
    color: #c0ceac;
    font: 11px/1.4 var(--mono);
    white-space: nowrap;
  }
  #send-error {
    max-width: var(--content-width);
    margin-inline: auto;
  }
  .mention-menu {
    position: absolute;
    z-index: 5;
    bottom: calc(100% + 4px);
    left: var(--gutter);
    right: var(--gutter);
    max-width: 520px;
    overflow: hidden;
    border: 1px solid #798954;
    border-radius: 3px;
    background: #252d1e;
    box-shadow: 3px 3px 0 #0005;
  }
  .mention-menu > p {
    margin: 0;
    padding: 8px 12px;
    color: #bdcda4;
    border-bottom: 1px solid #4b583b;
    font-size: 12px;
  }
  #mention-suggestions {
    position: relative;
    max-height: min(220px, calc(var(--app-height, 100dvh) * 0.4));
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .mention-option {
    display: block;
    width: 100%;
    min-height: 44px;
    padding: 10px 13px;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #3f4b31;
    color: var(--text);
    font-size: 15px;
    text-align: left;
  }
  .mention-option:hover,
  .mention-option[aria-selected='true'] {
    background: var(--accent);
    color: var(--ink);
  }
  @media (max-width: 700px) {
    .composer-wrap {
      padding: 6px 8px;
    }
    #composer {
      gap: 6px;
      padding: 4px;
    }
    #send-as {
      max-width: 27%;
      padding-inline: 4px;
    }
    .message-limit {
      font-size: 11px;
    }
    .mention-menu {
      left: 9px;
      right: 9px;
    }
    :global(.keyboard-open) .composer-wrap {
      padding-bottom: 6px;
    }
  }
</style>
