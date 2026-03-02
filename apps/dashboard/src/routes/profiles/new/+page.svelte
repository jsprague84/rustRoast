<script lang="ts">
	import { onMount } from 'svelte';
	import ProfileDesigner from '$lib/components/ProfileDesigner.svelte';
	import type { ProfileWithPoints } from '$lib/api/client.js';

	let initialProfile: ProfileWithPoints | null = $state(null);
	let ready = $state(false);

	onMount(() => {
		const raw = sessionStorage.getItem('rustroast_profile_from_session');
		if (raw) {
			try {
				initialProfile = JSON.parse(raw);
			} catch {
				// ignore malformed data
			}
			sessionStorage.removeItem('rustroast_profile_from_session');
		}
		ready = true;
	});
</script>

<svelte:head>
	<title>New Profile | rustRoast</title>
</svelte:head>

{#if ready}
	<ProfileDesigner {initialProfile} />
{/if}
