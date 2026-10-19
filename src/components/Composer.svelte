<script>
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { mentionQuery, mentionSuggestions, completeMention } from '../lib/mentions.js';
  let { session, lockedAccount = '' } = $props();
  const composer = $derived(
    lockedAccount ? session.composers.get(lockedAccount) : session.composer,
  );
  const prefix = $derived(
    lockedAccount ? 'account-' + encodeURIComponent(lockedAccount) + '-' : '',
  );
  const id = (name) => prefix + name;
  let input;
  let menu;
  let focused = $state(false);
  let caret = $state(0);
  let selected = $state(-1);
  let dismissed = $state('');
  let query = $derived(focused ? mentionQuery(composer.text, caret) : null);
  let queryKey = $derived(query ? `${query.start}:${query.end}:${query.prefix}` : '');
  let names = $derived(
    query && dismissed !== queryKey
      ? mentionSuggestions(session.presentNames(composer.account), query)
      : [],
  );
  let expanded = $derived(names.length > 0);
  let selectedIndex = $derived(Math.min(selected, names.length - 1));
  let activeOption = $derived(
    expanded && selectedIndex >= 0 ? id('mention-option-' + selectedIndex) : undefined,
  );

  $effect(() => {
    if (!lockedAccount || !expanded) return;
    let frame = 0;
    const position = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = input.closest('.composer-wrap').getBoundingClientRect();
        menu.style.left = bounds.left + 6 + 'px';
        menu.style.width = bounds.width - 12 + 'px';
        menu.style.bottom = window.innerHeight - bounds.top + 4 + 'px';
        menu.style.setProperty(
          '--mention-height',
          Math.max(44, Math.min(220, bounds.top - 60)) + 'px',
        );
      });
    };
    position();
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  });

  function changed() {
    caret = input.selectionStart ?? composer.text.length;
    selected = -1;
    dismissed = '';
    composer.changed();
  }

  async function complete(index) {
    if (!names[index]) return;
    const completion = completeMention(composer.text, query, names[index]);
    if (!completion) {
      composer.error = 'This name would exceed the 100-character limit.';
      return;
    }
    composer.text = completion.text;
    caret = completion.caret;
    selected = -1;
    composer.save();
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
        const option = document.getElementById(id('mention-option-' + selected));
        const list = document.getElementById(id('mention-suggestions'));
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
    session.send(composer);
    input.focus({ preventScroll: true });
    caret = input.selectionStart ?? composer.text.length;
  }
</script>

<footer class="composer-wrap" class:embedded={Boolean(lockedAccount)}>
  <div id={id('mention-menu')} class="mention-menu" bind:this={menu} hidden={!expanded}>
    <p id={id('mention-caption')} class="mention-caption">
      {expanded
        ? session.rosterComplete(composer.account)
          ? 'In this room'
          : 'Observed people'
        : ''}
    </p>
    <div
      id={id('mention-suggestions')}
      class="mention-suggestions"
      role="listbox"
      aria-label="Suggested people"
    >
      {#each names as name, index (name)}<button
          id={id('mention-option-' + index)}
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
  <form id={id('composer')} class="composer-form" data-account={composer.account} onsubmit={send}>
    {#if lockedAccount}
      <span class="sender-label" title={lockedAccount}>{lockedAccount}</span>
    {:else if !session.active}
      <select
        id="send-as"
        value={composer.account}
        onchange={(event) => {
          session.setSendAs(event.currentTarget.value);
          selected = -1;
          dismissed = '';
        }}
        aria-label="Send as"
        title="Send as"
        ><option value="">Choose account</option
        >{#each session.accounts as account (account.name)}<option value={account.name}
            >{account.name}</option
          >{/each}</select
      >
    {/if}
    <input
      id={id('message')}
      class="message-input"
      bind:this={input}
      bind:value={composer.text}
      oninput={changed}
      onfocus={() => {
        if (lockedAccount) session.setSendAs(lockedAccount, false);
        focused = true;
        caret = input.selectionStart ?? composer.text.length;
      }}
      onblur={() => (focused = false)}
      onclick={changed}
      onkeydown={keydown}
      onkeyup={moved}
      placeholder="Write a message…"
      aria-label={lockedAccount ? `Message as ${lockedAccount}` : 'Message'}
      aria-describedby={composer.error ? id('send-error') : undefined}
      role="combobox"
      aria-autocomplete="list"
      aria-controls={id('mention-suggestions')}
      aria-expanded={expanded}
      aria-activedescendant={activeOption}
      maxlength="100"
      autocomplete="off"
      disabled={!composer.account}
    />
    <span
      id={id('message-limit')}
      class="message-limit"
      hidden={composer.text.length < 80}
      aria-live="polite">{composer.text.length}/100</span
    >
    <button
      id={id('send')}
      class="send-button"
      type="submit"
      aria-label={lockedAccount ? `Send as ${lockedAccount}` : 'Send message'}
      disabled={!composer.account || !session.online || !composer.text.trim()}
      ><Icon name="send" /></button
    >
  </form>
  <p id={id('send-error')} class="send-error error" role="alert">{composer.error}</p>
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
  .composer-wrap.embedded {
    padding: 6px;
  }
  .embedded:focus-within {
    z-index: 6;
  }
  .embedded .composer-form {
    min-height: 50px;
    padding: 3px;
    gap: 6px;
  }
  .sender-label {
    flex: none;
    max-width: min(30%, 140px);
    padding: 4px 8px 4px 3px;
    border-right: 1px solid #4b583b;
    color: var(--accent);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .embedded .mention-menu {
    position: fixed;
    right: auto;
    max-width: none;
  }
  .embedded .mention-suggestions {
    max-height: var(--mention-height, 220px);
  }
  .composer-form {
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
  .composer-form:focus-within {
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
  .message-input {
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
  .message-input:focus {
    outline: 0;
  }
  .message-input::placeholder {
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
  .send-error {
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
  .mention-suggestions {
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
    .composer-form {
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
