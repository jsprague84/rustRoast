<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import {
		updateDevice,
		deleteDevice,
		addConnection,
		updateConnection,
		removeConnection,
		getRegisterMap,
		testConnection
	} from '$lib/api/devices.js';
	import type {
		ConfiguredDeviceWithConnections,
		DeviceConnection,
		ConnectionProtocol,
		ModbusRegisterMapEntry,
		TestConnectionResponse
	} from '$lib/types/device.js';
	import {
		Pencil,
		Trash2,
		Plus,
		Signal,
		Wifi,
		Database,
		ArrowLeft,
		Loader2,
		X,
		Check,
		Globe
	} from 'lucide-svelte';
	import type { PageProps } from './$types';
	import { onMount } from 'svelte';

	let { data }: PageProps = $props();

	let device = $derived(data.device as ConfiguredDeviceWithConnections);

	// --- Edit mode ---
	let editing = $state(false);
	let editName = $state('');
	let editDescription = $state('');
	let editLocation = $state('');
	let editStatus = $state('');
	let saving = $state(false);
	let saveError = $state('');

	function startEdit() {
		editName = device.name;
		editDescription = device.description ?? '';
		editLocation = device.location ?? '';
		editStatus = device.status;
		saveError = '';
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		saveError = '';
	}

	async function handleSave() {
		saving = true;
		saveError = '';
		try {
			await updateDevice(device.id, {
				name: editName.trim() || undefined,
				description: editDescription.trim() || undefined,
				location: editLocation.trim() || undefined,
				status: editStatus as ConfiguredDeviceWithConnections['status']
			});
			editing = false;
			await invalidateAll();
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}

	// --- Delete device ---
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);

	async function handleDelete() {
		deleting = true;
		try {
			await deleteDevice(device.id);
			goto('/devices');
		} catch {
			deleting = false;
			showDeleteConfirm = false;
		}
	}

	// --- Connections ---
	let showAddConnection = $state(false);
	let addProtocol = $state<ConnectionProtocol>('mqtt');
	let addEnabled = $state(true);
	let addConfig = $state<Record<string, unknown>>({});
	let addingConnection = $state(false);
	let addConnectionError = $state('');

	// Connection config fields
	let mqttTopicPrefix = $state('roaster/');
	let mqttQos = $state(0);
	let wsUrl = $state('ws://');
	let wsReconnectInterval = $state(5000);
	let modbusHost = $state('');
	let modbusPort = $state(502);
	let modbusUnitId = $state(1);

	function resetConnectionForm() {
		addProtocol = 'mqtt';
		addEnabled = true;
		mqttTopicPrefix = 'roaster/';
		mqttQos = 0;
		wsUrl = 'ws://';
		wsReconnectInterval = 5000;
		modbusHost = '';
		modbusPort = 502;
		modbusUnitId = 1;
		addConnectionError = '';
	}

	function getAddConnectionConfig(): Record<string, unknown> {
		if (addProtocol === 'mqtt') return { topic_prefix: mqttTopicPrefix, qos: mqttQos };
		if (addProtocol === 'websocket')
			return { url: wsUrl, reconnect_interval_ms: wsReconnectInterval };
		return { host: modbusHost, port: modbusPort, unit_id: modbusUnitId };
	}

	async function handleAddConnection() {
		addingConnection = true;
		addConnectionError = '';
		try {
			await addConnection(device.id, {
				protocol: addProtocol,
				enabled: addEnabled,
				config: getAddConnectionConfig()
			});
			showAddConnection = false;
			resetConnectionForm();
			await invalidateAll();
		} catch (err) {
			addConnectionError = err instanceof Error ? err.message : 'Failed to add connection';
		} finally {
			addingConnection = false;
		}
	}

	async function handleToggleConnection(conn: DeviceConnection) {
		try {
			await updateConnection(device.id, conn.id, { enabled: !conn.enabled });
			await invalidateAll();
		} catch {
			// silently fail
		}
	}

	let deletingConnectionId = $state<string | null>(null);

	async function handleRemoveConnection(connId: string) {
		deletingConnectionId = connId;
		try {
			await removeConnection(device.id, connId);
			await invalidateAll();
		} catch {
			// silently fail
		} finally {
			deletingConnectionId = null;
		}
	}

	// --- Test connection ---
	let testingConnectionId = $state<string | null>(null);
	let testResults = $state<Record<string, TestConnectionResponse>>({});

	async function handleTestConnection(conn: DeviceConnection) {
		testingConnectionId = conn.id;
		try {
			const result = await testConnection({
				protocol: conn.protocol,
				config: conn.config,
				device_id: device.device_id
			});
			testResults = { ...testResults, [conn.id]: result };
		} catch (err) {
			testResults = {
				...testResults,
				[conn.id]: {
					success: false,
					message: err instanceof Error ? err.message : 'Test failed'
				}
			};
		} finally {
			testingConnectionId = null;
		}
	}

	// --- Register map ---
	let registers = $state<ModbusRegisterMapEntry[]>([]);
	let loadingRegisters = $state(false);

	let hasModbusConnection = $derived(
		device.connections?.some((c) => c.protocol === 'modbus_tcp') ?? false
	);

	onMount(async () => {
		if (hasModbusConnection) {
			loadingRegisters = true;
			try {
				registers = await getRegisterMap(device.id);
			} catch {
				// no registers
			} finally {
				loadingRegisters = false;
			}
		}
	});

	// --- Helpers ---
	function relativeTime(iso: string | null | undefined): string {
		if (!iso) return 'Never';
		const diff = Date.now() - new Date(iso).getTime();
		if (diff < 0) return 'Just now';
		const secs = Math.floor(diff / 1000);
		if (secs < 60) return `${secs}s ago`;
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function statusClasses(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-500/15 text-green-400';
			case 'pending':
				return 'bg-amber-500/15 text-amber-400';
			case 'error':
				return 'bg-red-500/15 text-red-400';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	function protocolIcon(protocol: ConnectionProtocol) {
		if (protocol === 'mqtt') return Wifi;
		if (protocol === 'websocket') return Globe;
		return Database;
	}

	function protocolLabel(protocol: ConnectionProtocol): string {
		if (protocol === 'mqtt') return 'MQTT';
		if (protocol === 'websocket') return 'WebSocket';
		return 'Modbus TCP';
	}

	function connectionSummary(conn: DeviceConnection): string {
		const cfg = conn.config;
		if (conn.protocol === 'mqtt') return `${cfg.topic_prefix ?? ''}`;
		if (conn.protocol === 'websocket') return `${cfg.url ?? ''}`;
		return `${cfg.host ?? ''}:${cfg.port ?? 502}`;
	}
</script>

<svelte:head>
	<title>{device.name} | rustRoast</title>
</svelte:head>

<div class="space-y-6">
	<!-- Back link -->
	<a
		href="/devices"
		class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft class="h-4 w-4" />
		Back to Devices
	</a>

	<!-- Header section -->
	<div class="rounded-lg border border-border bg-card p-6">
		{#if editing}
			<!-- Edit mode -->
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-semibold text-foreground">Edit Device</h2>
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={cancelEdit}
							class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
						>
							Cancel
						</button>
						<button
							type="button"
							onclick={handleSave}
							disabled={saving || !editName.trim()}
							class="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
						>
							{#if saving}
								<Loader2 class="h-3.5 w-3.5 animate-spin" />
							{:else}
								<Check class="h-3.5 w-3.5" />
							{/if}
							Save
						</button>
					</div>
				</div>

				{#if saveError}
					<div
						class="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
					>
						{saveError}
					</div>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="edit-name" class="block text-sm font-medium text-foreground">
							Name <span class="text-red-400">*</span>
						</label>
						<input
							id="edit-name"
							type="text"
							bind:value={editName}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
					<div>
						<label for="edit-status" class="block text-sm font-medium text-foreground">
							Status
						</label>
						<select
							id="edit-status"
							bind:value={editStatus}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						>
							<option value="active">Active</option>
							<option value="pending">Pending</option>
							<option value="disabled">Disabled</option>
							<option value="error">Error</option>
						</select>
					</div>
					<div class="sm:col-span-2">
						<label for="edit-description" class="block text-sm font-medium text-foreground">
							Description
						</label>
						<textarea
							id="edit-description"
							bind:value={editDescription}
							rows={2}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						></textarea>
					</div>
					<div>
						<label for="edit-location" class="block text-sm font-medium text-foreground">
							Location
						</label>
						<input
							id="edit-location"
							type="text"
							bind:value={editLocation}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
				</div>
			</div>
		{:else}
			<!-- View mode -->
			<div class="flex items-start justify-between">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-3">
						<h1 class="text-2xl font-bold text-foreground">{device.name}</h1>
						<span
							class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {statusClasses(device.status)}"
						>
							{device.status}
						</span>
					</div>
					<p class="mt-1 text-sm text-muted-foreground">{device.device_id}</p>
					{#if device.description}
						<p class="mt-2 text-sm text-foreground">{device.description}</p>
					{/if}
					<div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
						{#if device.location}
							<span>{device.location}</span>
						{/if}
						<span>Last seen: {relativeTime(device.last_seen_at)}</span>
					</div>
				</div>
				<div class="ml-4 flex items-center gap-2">
					<button
						type="button"
						onclick={startEdit}
						class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
					>
						<Pencil class="h-3.5 w-3.5" />
						Edit
					</button>
					<button
						type="button"
						onclick={() => (showDeleteConfirm = true)}
						class="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20"
					>
						<Trash2 class="h-3.5 w-3.5" />
						Delete
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Delete confirmation dialog -->
	{#if showDeleteConfirm}
		<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
			<p class="text-sm text-red-400">
				Are you sure you want to delete <strong>{device.name}</strong>? This action cannot be
				undone.
			</p>
			<div class="mt-3 flex items-center gap-2">
				<button
					type="button"
					onclick={handleDelete}
					disabled={deleting}
					class="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
				>
					{#if deleting}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{/if}
					Yes, Delete
				</button>
				<button
					type="button"
					onclick={() => (showDeleteConfirm = false)}
					class="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	<!-- Connections section -->
	<div class="rounded-lg border border-border bg-card p-6">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold text-foreground">Connections</h2>
			<button
				type="button"
				onclick={() => {
					resetConnectionForm();
					showAddConnection = !showAddConnection;
				}}
				class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
			>
				{#if showAddConnection}
					<X class="h-3.5 w-3.5" />
					Cancel
				{:else}
					<Plus class="h-3.5 w-3.5" />
					Add Connection
				{/if}
			</button>
		</div>

		<!-- Add connection form -->
		{#if showAddConnection}
			<div class="mt-4 space-y-4 rounded-md border border-border bg-muted/30 p-4">
				<div>
					<label for="add-protocol" class="block text-sm font-medium text-foreground">
						Protocol
					</label>
					<div class="mt-1 flex rounded-md border border-border">
						<button
							type="button"
							onclick={() => (addProtocol = 'mqtt')}
							class="flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors
								{addProtocol === 'mqtt'
								? 'bg-amber-600 text-white'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
						>
							<Wifi class="h-3.5 w-3.5" />
							MQTT
						</button>
						<button
							type="button"
							onclick={() => (addProtocol = 'websocket')}
							class="flex flex-1 items-center justify-center gap-2 border-x border-border px-3 py-2 text-sm font-medium transition-colors
								{addProtocol === 'websocket'
								? 'bg-amber-600 text-white'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
						>
							<Globe class="h-3.5 w-3.5" />
							WebSocket
						</button>
						<button
							type="button"
							onclick={() => (addProtocol = 'modbus_tcp')}
							class="flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors
								{addProtocol === 'modbus_tcp'
								? 'bg-amber-600 text-white'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
						>
							<Database class="h-3.5 w-3.5" />
							Modbus TCP
						</button>
					</div>
				</div>

				{#if addProtocol === 'mqtt'}
					<div>
						<label for="add-mqtt-topic" class="block text-sm font-medium text-foreground">
							Topic Prefix
						</label>
						<input
							id="add-mqtt-topic"
							type="text"
							bind:value={mqttTopicPrefix}
							placeholder="e.g. roaster/"
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
					<div>
						<label for="add-mqtt-qos" class="block text-sm font-medium text-foreground">
							QoS
						</label>
						<select
							id="add-mqtt-qos"
							bind:value={mqttQos}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						>
							<option value={0}>0 - At most once</option>
							<option value={1}>1 - At least once</option>
							<option value={2}>2 - Exactly once</option>
						</select>
					</div>
				{:else if addProtocol === 'websocket'}
					<div>
						<label for="add-ws-url" class="block text-sm font-medium text-foreground">
							WebSocket URL
						</label>
						<input
							id="add-ws-url"
							type="text"
							bind:value={wsUrl}
							placeholder="ws://192.168.1.100:8080/ws"
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
					<div>
						<label for="add-ws-reconnect" class="block text-sm font-medium text-foreground">
							Reconnect Interval (ms)
						</label>
						<input
							id="add-ws-reconnect"
							type="number"
							bind:value={wsReconnectInterval}
							min={1000}
							step={1000}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
				{:else if addProtocol === 'modbus_tcp'}
					<div>
						<label for="add-modbus-host" class="block text-sm font-medium text-foreground">
							Host
						</label>
						<input
							id="add-modbus-host"
							type="text"
							bind:value={modbusHost}
							placeholder="192.168.1.100"
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="add-modbus-port" class="block text-sm font-medium text-foreground">
								Port
							</label>
							<input
								id="add-modbus-port"
								type="number"
								bind:value={modbusPort}
								min={1}
								max={65535}
								class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
							/>
						</div>
						<div>
							<label for="add-modbus-unit" class="block text-sm font-medium text-foreground">
								Unit ID
							</label>
							<input
								id="add-modbus-unit"
								type="number"
								bind:value={modbusUnitId}
								min={0}
								max={247}
								class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
							/>
						</div>
					</div>
				{/if}

				{#if addConnectionError}
					<div
						class="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
					>
						{addConnectionError}
					</div>
				{/if}

				<button
					type="button"
					onclick={handleAddConnection}
					disabled={addingConnection}
					class="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
				>
					{#if addingConnection}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{/if}
					Add Connection
				</button>
			</div>
		{/if}

		<!-- Connection list -->
		{#if device.connections && device.connections.length > 0}
			<div class="mt-4 space-y-3">
				{#each device.connections as conn}
					{@const Icon = protocolIcon(conn.protocol)}
					<div class="rounded-md border border-border bg-muted/20 p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<Icon class="h-4 w-4 text-muted-foreground" />
								<div>
									<span class="text-sm font-medium text-foreground">
										{protocolLabel(conn.protocol)}
									</span>
									<span class="ml-2 text-xs text-muted-foreground">
										{connectionSummary(conn)}
									</span>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<!-- Test button -->
								<button
									type="button"
									onclick={() => handleTestConnection(conn)}
									disabled={testingConnectionId === conn.id}
									class="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50"
								>
									{#if testingConnectionId === conn.id}
										<Loader2 class="inline h-3 w-3 animate-spin" />
									{:else}
										Test
									{/if}
								</button>
								<!-- Enabled toggle -->
								<button
									type="button"
									onclick={() => handleToggleConnection(conn)}
									class="rounded-md px-2.5 py-1 text-xs font-medium {conn.enabled
										? 'bg-green-500/15 text-green-400'
										: 'bg-muted text-muted-foreground'}"
								>
									{conn.enabled ? 'Enabled' : 'Disabled'}
								</button>
								<!-- Delete -->
								<button
									type="button"
									onclick={() => handleRemoveConnection(conn.id)}
									disabled={deletingConnectionId === conn.id}
									class="rounded-md p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
								>
									{#if deletingConnectionId === conn.id}
										<Loader2 class="h-3.5 w-3.5 animate-spin" />
									{:else}
										<Trash2 class="h-3.5 w-3.5" />
									{/if}
								</button>
							</div>
						</div>
						<!-- Test result -->
						{#if testResults[conn.id]}
							{@const result = testResults[conn.id]}
							<div class="mt-2 text-xs {result.success ? 'text-green-400' : 'text-red-400'}">
								{result.message}
								{#if result.latency_ms != null}
									({result.latency_ms}ms)
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if !showAddConnection}
			<p class="mt-4 text-sm text-muted-foreground">
				No connections configured. Add a connection to communicate with this device.
			</p>
		{/if}
	</div>

	<!-- Register Map section -->
	{#if hasModbusConnection}
		<div class="rounded-lg border border-border bg-card p-6">
			<h2 class="text-lg font-semibold text-foreground">Register Map</h2>
			{#if loadingRegisters}
				<div class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 class="h-4 w-4 animate-spin" />
					Loading registers...
				</div>
			{:else if registers.length > 0}
				<div class="mt-4 overflow-x-auto rounded-md border border-border">
					<table class="w-full text-left text-sm">
						<thead class="border-b border-border bg-muted/50">
							<tr>
								<th class="px-3 py-2 font-medium text-muted-foreground">Address</th>
								<th class="px-3 py-2 font-medium text-muted-foreground">Name</th>
								<th class="px-3 py-2 font-medium text-muted-foreground">Type</th>
								<th class="px-3 py-2 font-medium text-muted-foreground">Data Type</th>
								<th class="px-3 py-2 font-medium text-muted-foreground">Unit</th>
								<th class="px-3 py-2 font-medium text-muted-foreground">Writable</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each registers as reg}
								<tr class="text-foreground">
									<td class="px-3 py-2 font-mono text-xs">0x{reg.address.toString(16).padStart(4, '0').toUpperCase()}</td>
									<td class="px-3 py-2 text-xs">{reg.name}</td>
									<td class="px-3 py-2 text-xs">{reg.register_type}</td>
									<td class="px-3 py-2 text-xs">{reg.data_type}</td>
									<td class="px-3 py-2 text-xs">{reg.unit ?? ''}</td>
									<td class="px-3 py-2 text-xs">{reg.writable ? 'RW' : 'R'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="mt-4 text-sm text-muted-foreground">No registers configured for this device.</p>
			{/if}
		</div>
	{/if}
</div>
