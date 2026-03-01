<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
	<p class="text-6xl font-bold text-gray-300">{page.status}</p>

	{#if page.status === 404}
		<h1 class="mt-4 text-2xl font-semibold text-gray-900">Page not found</h1>
		<p class="mt-2 text-gray-500">The page you're looking for doesn't exist or has been moved.</p>
	{:else}
		<h1 class="mt-4 text-2xl font-semibold text-gray-900">Something went wrong</h1>
		<p class="mt-2 text-gray-500">{page.error?.message ?? 'An unexpected error occurred.'}</p>
	{/if}

	<a
		href="/"
		class="mt-6 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
	>
		Back to Dashboard
	</a>
</div>
