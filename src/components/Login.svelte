<script>
  import Brand from './Brand.svelte';
  let { session } = $props();
  let link = $state('');

  function connect(event) {
    event.preventDefault();
    session.start(link);
    if (session.open) link = '';
  }
</script>

<section id="welcome" class="welcome" hidden={session.open}>
  <div class="login-card">
    <Brand heading />
    <p id="link-guide" class="login-guide">
      <a href="https://acium.app/" target="_blank" rel="noopener noreferrer">Log ind hos acidum ↗</a
      >
      og åbn webchatten. Kopiér hele linket fra adresselinjen og indsæt det her.
    </p>
    <form id="connect-form" onsubmit={connect}>
      <input
        id="chat-link"
        type="password"
        bind:value={link}
        aria-label="Dit acidum-webchat-link"
        aria-describedby="link-guide"
        placeholder="https://acium.app/chat?token=…"
        autocomplete="off"
        spellcheck="false"
        required
      />
      <p id="login-error" class="error" role="alert">{session.loginError}</p>
      <button class="primary" type="submit">Åbn chat <span aria-hidden="true">→</span></button>
    </form>
    <button
      id="resume-saved"
      class="text-button"
      type="button"
      hidden={!session.resumeAvailable}
      onclick={() => session.resume()}>Prøv det gemte link igen</button
    >
  </div>
</section>

<style>
  .welcome {
    display: flex;
    min-height: 100dvh;
    align-items: center;
    justify-content: center;
    padding: 28px;
  }
  .login-card {
    width: 100%;
    max-width: 350px;
  }
  .welcome :global(.brand) {
    font-size: 58px;
    letter-spacing: -3.8px;
    margin: 0 0 32px;
    gap: 14px;
  }
  .welcome :global(.brand-icon) {
    width: 45px;
    height: 45px;
  }
  .login-guide {
    font-size: 13px;
    line-height: 1.7;
    color: var(--muted);
    margin: 0 0 24px;
  }
  .login-guide a {
    color: var(--text);
    text-decoration-color: #768448;
  }
  .login-guide a:hover {
    color: var(--accent);
  }
  #chat-link {
    width: 100%;
    border: 1px solid #515a45;
    border-bottom: 2px solid var(--accent);
    border-radius: 3px;
    background: var(--panel);
    color: var(--text);
    padding: 15px 13px;
    font-size: 16px;
  }
  #chat-link::placeholder {
    color: #969d8b;
    font-size: 13px;
  }
  .primary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 12px 15px;
    margin-top: 12px;
    background: var(--accent);
    color: var(--ink);
    border: 0;
    border-radius: 3px;
    font-weight: 700;
  }
  .primary:hover {
    background: #e7ff97;
  }
  .primary span {
    font-size: 23px;
    font-weight: 400;
  }
  #resume-saved {
    display: block;
    min-height: 44px;
    margin: 12px auto 0;
    text-align: center;
  }
</style>
