<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { createDevice, addConnection, setRegisterMap, testConnection, listDeviceProfiles } from '$lib/api/devices.js';
	import { MODBUS_PRESETS } from '$lib/constants/modbus-presets.js';
	import type { ConnectionProtocol, CreateRegisterMapEntry, DeviceProfile, TestConnectionResponse } from '$lib/types/device.js';
	import { ChevronLeft, ChevronRight, Check, Loader2, Wifi, Globe, Database } from 'lucide-svelte';
	import { onMount } from 'svelte';

	// --- State ---
	let step = $state(1);
	const totalSteps = 4;

	// Step 1: Basic Info
	let deviceId = $state($page.url.searchParams.get('device_id') ?? '');
	let name = $state('');
	let description = $state('');
	let location = $state('');
	let profileId = $state('');

	// Device profiles for dropdown
	let profiles = $state<DeviceProfile[]>([]);

	onMount(async () => {
		try {
			profiles = await listDeviceProfiles();
		} catch {
			// Profiles are optional
		}
	});

	// Step 2: Connections
	let protocol = $state<ConnectionProtocol>('mqtt');

	// MQTT config
	let mqttTopicPrefix = $state('roaster/');
	let mqttQos = $state(0);

	// WebSocket config
	let wsUrl = $state('ws://');
	let wsReconnectInterval = $state(5000);

	// Modbus TCP config
	let modbusHost = $state('');
	let modbusPort = $state(502);
	let modbusUnitId = $state(1);

	// Step 3: Register Map (Modbus only)
	let selectedPresetId = $state('rustroast-standard');
	let registers = $state<CreateRegisterMapEntry[]>(
		MODBUS_PRESETS[0].registers.map((r) => ({
			register_type: r.register_type,
			address: r.address,
			name: r.name,
			data_type: r.data_type,
			byte_order: r.byte_order,
			scale_factor: r.scale_factor,
			offset: r.offset,
			unit: r.unit,
			description: r.description,
			writable: r.writable,
		}))
	);

	// Step 4: Review & Test
	let testing = $state(false);
	let testResult = $state<TestConnectionResponse | null>(null);
	let creating = $state(false);
	let createError = $state('');

	// --- Derived ---
	let isModbus = $derived(protocol === 'modbus_tcp');

	let effectiveSteps = $derived(isModbus ? [1, 2, 3, 4] : [1, 2, 4]);

	let currentStepIndex = $derived(effectiveSteps.indexOf(step));

	let canGoNext = $derived(() => {
		if (step === 1) return deviceId.trim() !== '' && name.trim() !== '';
		if (step === 2) {
			if (protocol === 'mqtt') return mqttTopicPrefix.trim() !== '';
			if (protocol === 'websocket') return wsUrl.trim() !== '' && wsUrl !== 'ws://';
			if (protocol === 'modbus_tcp') return modbusHost.trim() !== '' && modbusPort > 0;
		}
		return true;
	});

	let stepLabels = ['Basic Info', 'Connections', 'Register Map', 'Review & Test'];

	// --- Preset selection ---
	function applyPreset(presetId: string) {
		selectedPresetId = presetId;
		const preset = MODBUS_PRESETS.find((p) => p.id === presetId);
		if (preset) {
			registers = preset.registers.map((r) => ({
				register_type: r.register_type,
				address: r.address,
				name: r.name,
				data_type: r.data_type,
				byte_order: r.byte_order,
				scale_factor: r.scale_factor,
				offset: r.offset,
				unit: r.unit,
				description: r.description,
				writable: r.writable,
			}));
		}
	}

	// --- Register CRUD ---
	function addRegister() {
		registers = [
			...registers,
			{
				register_type: 'input',
				address: 0,
				name: '',
				data_type: 'uint16',
				byte_order: 'AB',
				scale_factor: 1.0,
				offset: 0.0,
				unit: '',
				description: '',
				writable: false,
			},
		];
	}

	function removeRegister(index: number) {
		registers = registers.filter((_, i) => i !== index);
	}

	// --- Navigation ---
	function goNext() {
		if (!canGoNext()) return;
		const idx = currentStepIndex;
		if (idx < effectiveSteps.length - 1) {
			step = effectiveSteps[idx + 1];
		}
	}

	function goBack() {
		const idx = currentStepIndex;
		if (idx > 0) {
			step = effectiveSteps[idx - 1];
		}
	}

	// --- Connection config builder ---
	function getConnectionConfig(): Record<string, unknown> {
		if (protocol === 'mqtt') {
			return { topic_prefix: mqttTopicPrefix, qos: mqttQos };
		}
		if (protocol === 'websocket') {
			return { url: wsUrl, reconnect_interval_ms: wsReconnectInterval };
		}
		return { host: modbusHost, port: modbusPort, unit_id: modbusUnitId };
	}

	// --- Test Connection ---
	async function handleTestConnection() {
		testing = true;
		testResult = null;
		try {
			testResult = await testConnection({
				protocol,
				config: getConnectionConfig(),
				device_id: deviceId || undefined,
			});
		} catch (err) {
			testResult = {
				success: false,
				message: err instanceof Error ? err.message : 'Connection test failed',
			};
		} finally {
			testing = false;
		}
	}

	// --- Create Device ---
	async function handleCreate() {
		creating = true;
		createError = '';
		try {
			// 1. Create the device
			const device = await createDevice({
				device_id: deviceId.trim(),
				name: name.trim(),
				profile_id: profileId || undefined,
				description: description.trim() || undefined,
				location: location.trim() || undefined,
			});

			// 2. Add the connection
			await addConnection(device.id, {
				protocol,
				enabled: true,
				config: getConnectionConfig(),
			});

			// 3. Set register map if Modbus
			if (isModbus && registers.length > 0) {
				await setRegisterMap(device.id, registers);
			}

			// 4. Navigate to device detail
			goto(`/devices/${device.id}`);
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create device';
		} finally {
			creating = false;
		}
	}

	// Protocol icon component helper
	function protocolLabel(p: ConnectionProtocol): string {
		if (p === 'mqtt') return 'MQTT';
		if (p === 'websocket') return 'WebSocket';
		return 'Modbus TCP';
	}
</script>

<svelte:head>
	<title>New Device | rustRoast</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<!-- Header -->
	<div class="flex items-center gap-3">
		<a
			href="/devices"
			class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			<ChevronLeft class="h-5 w-5" />
		</a>
		<h1 class="text-2xl font-bold text-foreground">New Device</h1>
	</div>

	<!-- Step indicator -->
	<div class="flex items-center gap-2">
		{#each effectiveSteps as s, i}
			{@const label = stepLabels[s - 1]}
			{@const isCompleted = currentStepIndex > i}
			{@const isActive = s === step}
			<div class="flex items-center gap-2">
				<div
					class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold
						{isCompleted
						? 'bg-amber-600 text-white'
						: isActive
							? 'border-2 border-amber-500 text-amber-400'
							: 'border border-border text-muted-foreground'}"
				>
					{#if isCompleted}
						<Check class="h-3.5 w-3.5" />
					{:else}
						{s}
					{/if}
				</div>
				<span
					class="hidden text-sm sm:inline
						{isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}"
				>
					{label}
				</span>
			</div>
			{#if i < effectiveSteps.length - 1}
				<div class="h-px flex-1 {currentStepIndex > i ? 'bg-amber-600' : 'bg-border'}"></div>
			{/if}
		{/each}
	</div>

	<!-- Step Content -->
	<div class="rounded-lg border border-border bg-card p-6">
		{#if step === 1}
			<!-- Step 1: Basic Info -->
			<h2 class="text-lg font-semibold text-foreground">Basic Information</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Enter the device identification and optional details.
			</p>

			<div class="mt-5 space-y-4">
				<div>
					<label for="device-id" class="block text-sm font-medium text-foreground">
						Device ID <span class="text-red-400">*</span>
					</label>
					<input
						id="device-id"
						type="text"
						bind:value={deviceId}
						placeholder="e.g. roaster-01"
						class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
					/>
				</div>

				<div>
					<label for="device-name" class="block text-sm font-medium text-foreground">
						Name <span class="text-red-400">*</span>
					</label>
					<input
						id="device-name"
						type="text"
						bind:value={name}
						placeholder="e.g. Main Roaster"
						class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
					/>
				</div>

				<div>
					<label for="device-description" class="block text-sm font-medium text-foreground">
						Description
					</label>
					<textarea
						id="device-description"
						bind:value={description}
						rows={3}
						placeholder="Optional description..."
						class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
					></textarea>
				</div>

				<div>
					<label for="device-location" class="block text-sm font-medium text-foreground">
						Location
					</label>
					<input
						id="device-location"
						type="text"
						bind:value={location}
						placeholder="e.g. Garage, Lab bench"
						class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
					/>
				</div>

				<div>
					<label for="device-profile" class="block text-sm font-medium text-foreground">
						Device Profile
					</label>
					<select
						id="device-profile"
						bind:value={profileId}
						class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
					>
						<option value="">None</option>
						{#each profiles as profile}
							<option value={profile.id}>{profile.name}</option>
						{/each}
					</select>
				</div>
			</div>
		{:else if step === 2}
			<!-- Step 2: Connections -->
			<h2 class="text-lg font-semibold text-foreground">Connection</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Choose a communication protocol and configure its settings.
			</p>

			<!-- Protocol tabs -->
			<div class="mt-5 flex rounded-md border border-border">
				<button
					type="button"
					onclick={() => (protocol = 'mqtt')}
					class="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors
						{protocol === 'mqtt'
						? 'bg-amber-600 text-white'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
				>
					<Wifi class="h-4 w-4" />
					MQTT
				</button>
				<button
					type="button"
					onclick={() => (protocol = 'websocket')}
					class="flex flex-1 items-center justify-center gap-2 border-x border-border px-4 py-2.5 text-sm font-medium transition-colors
						{protocol === 'websocket'
						? 'bg-amber-600 text-white'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
				>
					<Globe class="h-4 w-4" />
					WebSocket
				</button>
				<button
					type="button"
					onclick={() => (protocol = 'modbus_tcp')}
					class="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors
						{protocol === 'modbus_tcp'
						? 'bg-amber-600 text-white'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
				>
					<Database class="h-4 w-4" />
					Modbus TCP
				</button>
			</div>

			<!-- Protocol-specific fields -->
			<div class="mt-5 space-y-4">
				{#if protocol === 'mqtt'}
					<div>
						<label for="mqtt-topic" class="block text-sm font-medium text-foreground">
							Topic Prefix <span class="text-red-400">*</span>
						</label>
						<input
							id="mqtt-topic"
							type="text"
							bind:value={mqttTopicPrefix}
							placeholder="e.g. roaster/"
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
						<p class="mt-1 text-xs text-muted-foreground">
							Base topic prefix for MQTT messages (e.g. roaster/device-01/telemetry)
						</p>
					</div>
					<div>
						<label for="mqtt-qos" class="block text-sm font-medium text-foreground">QoS</label>
						<select
							id="mqtt-qos"
							bind:value={mqttQos}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						>
							<option value={0}>0 - At most once</option>
							<option value={1}>1 - At least once</option>
							<option value={2}>2 - Exactly once</option>
						</select>
					</div>
				{:else if protocol === 'websocket'}
					<div>
						<label for="ws-url" class="block text-sm font-medium text-foreground">
							WebSocket URL <span class="text-red-400">*</span>
						</label>
						<input
							id="ws-url"
							type="text"
							bind:value={wsUrl}
							placeholder="ws://192.168.1.100:8080/ws"
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
					<div>
						<label for="ws-reconnect" class="block text-sm font-medium text-foreground">
							Reconnect Interval (ms)
						</label>
						<input
							id="ws-reconnect"
							type="number"
							bind:value={wsReconnectInterval}
							min={1000}
							step={1000}
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
				{:else if protocol === 'modbus_tcp'}
					<div>
						<label for="modbus-host" class="block text-sm font-medium text-foreground">
							Host <span class="text-red-400">*</span>
						</label>
						<input
							id="modbus-host"
							type="text"
							bind:value={modbusHost}
							placeholder="192.168.1.100"
							class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="modbus-port" class="block text-sm font-medium text-foreground">
								Port <span class="text-red-400">*</span>
							</label>
							<input
								id="modbus-port"
								type="number"
								bind:value={modbusPort}
								min={1}
								max={65535}
								class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
							/>
						</div>
						<div>
							<label for="modbus-unit" class="block text-sm font-medium text-foreground">
								Unit ID
							</label>
							<input
								id="modbus-unit"
								type="number"
								bind:value={modbusUnitId}
								min={0}
								max={247}
								class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
							/>
						</div>
					</div>
				{/if}
			</div>
		{:else if step === 3}
			<!-- Step 3: Register Map (Modbus only) -->
			<h2 class="text-lg font-semibold text-foreground">Register Map</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Choose a preset or define custom Modbus registers.
			</p>

			<div class="mt-5 space-y-4">
				<div>
					<label for="modbus-preset" class="block text-sm font-medium text-foreground">
						Preset
					</label>
					<select
						id="modbus-preset"
						value={selectedPresetId}
						onchange={(e) => applyPreset(e.currentTarget.value)}
						class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
					>
						{#each MODBUS_PRESETS as preset}
							<option value={preset.id}>{preset.name} &mdash; {preset.description}</option>
						{/each}
					</select>
				</div>

				<!-- Register table -->
				{#if registers.length > 0}
					<div class="overflow-x-auto rounded-md border border-border">
						<table class="w-full text-left text-sm">
							<thead class="border-b border-border bg-muted/50">
								<tr>
									<th class="px-3 py-2 font-medium text-muted-foreground">Address</th>
									<th class="px-3 py-2 font-medium text-muted-foreground">Name</th>
									<th class="px-3 py-2 font-medium text-muted-foreground">Type</th>
									<th class="px-3 py-2 font-medium text-muted-foreground">Data Type</th>
									<th class="px-3 py-2 font-medium text-muted-foreground">Unit</th>
									<th class="px-3 py-2 font-medium text-muted-foreground">RW</th>
									<th class="px-3 py-2 font-medium text-muted-foreground"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each registers as reg, i}
									<tr class="text-foreground">
										<td class="px-3 py-1.5">
											<input
												type="number"
												bind:value={reg.address}
												class="w-20 rounded border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
											/>
										</td>
										<td class="px-3 py-1.5">
											<input
												type="text"
												bind:value={reg.name}
												class="w-28 rounded border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
											/>
										</td>
										<td class="px-3 py-1.5">
											<select
												bind:value={reg.register_type}
												class="rounded border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
											>
												<option value="input">input</option>
												<option value="holding">holding</option>
												<option value="coil">coil</option>
											</select>
										</td>
										<td class="px-3 py-1.5">
											<select
												bind:value={reg.data_type}
												class="rounded border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
											>
												<option value="uint16">uint16</option>
												<option value="int16">int16</option>
												<option value="float32">float32</option>
												<option value="bool">bool</option>
											</select>
										</td>
										<td class="px-3 py-1.5">
											<input
												type="text"
												bind:value={reg.unit}
												class="w-14 rounded border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
											/>
										</td>
										<td class="px-3 py-1.5 text-xs">
											{reg.writable ? 'RW' : 'R'}
										</td>
										<td class="px-3 py-1.5">
											<button
												type="button"
												onclick={() => removeRegister(i)}
												class="text-xs text-red-400 hover:text-red-300"
											>
												Remove
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No registers defined. Add registers or choose a preset.</p>
				{/if}

				<button
					type="button"
					onclick={addRegister}
					class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
				>
					+ Add Register
				</button>
			</div>
		{:else if step === 4}
			<!-- Step 4: Review & Test -->
			<h2 class="text-lg font-semibold text-foreground">Review & Test</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Review your configuration and optionally test the connection before creating.
			</p>

			<div class="mt-5 space-y-4">
				<!-- Summary -->
				<div class="space-y-3 rounded-md border border-border bg-muted/30 p-4 text-sm">
					<div>
						<span class="font-medium text-muted-foreground">Device ID:</span>
						<span class="ml-2 text-foreground">{deviceId}</span>
					</div>
					<div>
						<span class="font-medium text-muted-foreground">Name:</span>
						<span class="ml-2 text-foreground">{name}</span>
					</div>
					{#if description}
						<div>
							<span class="font-medium text-muted-foreground">Description:</span>
							<span class="ml-2 text-foreground">{description}</span>
						</div>
					{/if}
					{#if location}
						<div>
							<span class="font-medium text-muted-foreground">Location:</span>
							<span class="ml-2 text-foreground">{location}</span>
						</div>
					{/if}
					{#if profileId}
						{@const selectedProfile = profiles.find((p) => p.id === profileId)}
						<div>
							<span class="font-medium text-muted-foreground">Profile:</span>
							<span class="ml-2 text-foreground">{selectedProfile?.name ?? profileId}</span>
						</div>
					{/if}
					<div class="border-t border-border pt-3">
						<span class="font-medium text-muted-foreground">Protocol:</span>
						<span class="ml-2 text-foreground">{protocolLabel(protocol)}</span>
					</div>
					{#if protocol === 'mqtt'}
						<div>
							<span class="font-medium text-muted-foreground">Topic Prefix:</span>
							<span class="ml-2 text-foreground">{mqttTopicPrefix}</span>
						</div>
						<div>
							<span class="font-medium text-muted-foreground">QoS:</span>
							<span class="ml-2 text-foreground">{mqttQos}</span>
						</div>
					{:else if protocol === 'websocket'}
						<div>
							<span class="font-medium text-muted-foreground">URL:</span>
							<span class="ml-2 text-foreground">{wsUrl}</span>
						</div>
						<div>
							<span class="font-medium text-muted-foreground">Reconnect:</span>
							<span class="ml-2 text-foreground">{wsReconnectInterval}ms</span>
						</div>
					{:else if protocol === 'modbus_tcp'}
						<div>
							<span class="font-medium text-muted-foreground">Host:</span>
							<span class="ml-2 text-foreground">{modbusHost}:{modbusPort}</span>
						</div>
						<div>
							<span class="font-medium text-muted-foreground">Unit ID:</span>
							<span class="ml-2 text-foreground">{modbusUnitId}</span>
						</div>
					{/if}
					{#if isModbus && registers.length > 0}
						<div class="border-t border-border pt-3">
							<span class="font-medium text-muted-foreground">Registers:</span>
							<span class="ml-2 text-foreground">{registers.length} entries</span>
						</div>
					{/if}
				</div>

				<!-- Test Connection -->
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={handleTestConnection}
						disabled={testing}
						class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
					>
						{#if testing}
							<Loader2 class="h-4 w-4 animate-spin" />
							Testing...
						{:else}
							Test Connection
						{/if}
					</button>

					{#if testResult}
						<span
							class="text-sm {testResult.success ? 'text-green-400' : 'text-red-400'}"
						>
							{testResult.message}
							{#if testResult.latency_ms != null}
								({testResult.latency_ms}ms)
							{/if}
						</span>
					{/if}
				</div>

				<!-- Create Error -->
				{#if createError}
					<div class="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
						{createError}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Navigation buttons -->
	<div class="flex items-center justify-between">
		<div>
			{#if currentStepIndex > 0}
				<button
					type="button"
					onclick={goBack}
					class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
				>
					<ChevronLeft class="h-4 w-4" />
					Back
				</button>
			{/if}
		</div>
		<div>
			{#if step === effectiveSteps[effectiveSteps.length - 1]}
				<!-- Final step: Create button -->
				<button
					type="button"
					onclick={handleCreate}
					disabled={creating || !canGoNext()}
					class="inline-flex items-center gap-2 rounded-md bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
				>
					{#if creating}
						<Loader2 class="h-4 w-4 animate-spin" />
						Creating...
					{:else}
						<Check class="h-4 w-4" />
						Create Device
					{/if}
				</button>
			{:else}
				<button
					type="button"
					onclick={goNext}
					disabled={!canGoNext()}
					class="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
				>
					Next
					<ChevronRight class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>
</div>
