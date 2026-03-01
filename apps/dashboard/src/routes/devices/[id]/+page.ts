import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/devices/${encodeURIComponent(params.id)}`);
	if (!res.ok) error(404, 'Device not found');
	const device = await res.json();
	return { device };
};
