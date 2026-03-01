<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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
</script>

<svelte:head>
	<title>Sessions | rustRoast</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-bold text-foreground">Sessions</h1>

	{#if data.sessions.length === 0}
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
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each data.sessions as session}
						<tr class="cursor-pointer hover:bg-accent">
							<td class="px-4 py-3 text-sm text-foreground">
								<a href="/sessions/{session.id}" class="hover:text-amber-400">{formatDate(session.created_at)}</a>
							</td>
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
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
