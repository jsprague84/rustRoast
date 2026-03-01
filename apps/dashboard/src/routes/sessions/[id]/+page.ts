import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	const [sessionRes, eventsRes] = await Promise.all([
		fetch(`/api/sessions/${params.id}`),
		fetch(`/api/sessions/${params.id}/events`)
	]);

	if (!sessionRes.ok) error(500, 'Failed to load session');
	if (!eventsRes.ok) error(500, 'Failed to load events');

	const [session, events] = await Promise.all([sessionRes.json(), eventsRes.json()]);
	return { session, events };
};
