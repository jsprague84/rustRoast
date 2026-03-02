<script lang="ts">
	import type { PageProps } from './$types';
	import { goto } from '$app/navigation';
	import { sessions } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';

	let { data }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let sessionList = $state(data.sessions);

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDuration(seconds: number | null): string {
		if (seconds == null) return '--';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	async function deleteSession(e: MouseEvent, id: string) {
		e.stopPropagation();
		if (!confirm('Delete this session? This cannot be undone.')) return;
		try {
			await sessions.delete(id);
			sessionList = sessionList.filter((s: { id: string }) => s.id !== id);
			notifications.add('Session deleted', 'success');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			notifications.add(`Failed to delete session: ${msg}`, 'error');
		}
	}
</script>

<svelte:head>
	<title>Sessions | rustRoast</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-bold text-foreground">Sessions</h1>

	{#if sessionList.length === 0}
		<div class="mt-8 text-center">
			<p class="text-muted-foreground">No roast sessions yet.</p>
			<p class="mt-1 text-sm text-muted-foreground">Start a roast from the Dashboard to begin tracking.</p>
		</div>
	{:else}
		<div class="mt-4 overflow-hidden rounded-lg border border-border bg-card">
			<table class="min-w-full divide-y divide-border">
				<thead class="bg-muted">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Date</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Name</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Bean</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Duration</th>
						<th class="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
						<th class="w-16 px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each sessionList as session}
						<tr class="cursor-pointer hover:bg-accent" onclick={() => goto(`/sessions/${session.id}`)}>
							<td class="px-4 py-3 text-sm text-foreground">{formatDate(session.created_at)}</td>
							<td class="px-4 py-3 text-sm text-foreground">{session.name}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{session.bean_origin ?? '--'}
								{#if session.bean_variety}
									<span class="text-muted-foreground">({session.bean_variety})</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">{formatDuration(session.total_time_seconds)}</td>
							<td class="px-4 py-3 text-sm">
								<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium
									{session.status === 'completed' ? 'bg-green-500/15 text-green-400' :
									 session.status === 'active' ? 'bg-amber-500/15 text-amber-400' :
									 session.status === 'paused' ? 'bg-yellow-500/15 text-yellow-400' :
									 'bg-muted text-muted-foreground'}">
									{session.status}
								</span>
							</td>
							<td class="px-4 py-3 text-right">
								<button
									onclick={(e) => deleteSession(e, session.id)}
									class="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
									title="Delete session"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
