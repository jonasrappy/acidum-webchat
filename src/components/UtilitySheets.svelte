<script>
  import Rooms from './Rooms.svelte';
  import Settings from './Settings.svelte';
  import PersonActions from './PersonActions.svelte';
  import MessageActions from './MessageActions.svelte';
  let { session } = $props();
</script>

<Rooms {session} />
<Settings {session} />
<PersonActions {session} />
<MessageActions {session} />
