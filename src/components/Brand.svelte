<script>
  let { heading = false } = $props();
</script>

<svelte:element this={heading ? 'h1' : 'div'} class="brand"
  ><span class="brand-icon" aria-hidden="true"></span> acidum</svelte:element
>

<style>
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 32px;
    font-weight: 800;
    font-style: italic;
    letter-spacing: -1.9px;
    line-height: 1;
  }
  .brand-icon {
    flex: none;
    width: 29px;
    height: 29px;
    background: url('/icon.svg') center/contain no-repeat;
    font-size: 0;
  }
</style>
