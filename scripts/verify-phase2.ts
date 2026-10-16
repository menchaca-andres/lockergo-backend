import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { Client } from 'pg';
import { config } from 'dotenv';

const backendDirectory = process.cwd();
const loadedEnv = config({ quiet: true }).parsed ?? {};
for (const key of ['DATABASE_URL']) {
  if (!process.env[key]?.trim() && loadedEnv[key]?.trim()) {
    process.env[key] = loadedEnv[key];
  }
}
const originalDatabaseUrl = process.env.DATABASE_URL;

if (!originalDatabaseUrl) {
  throw new Error('DATABASE_URL must be configured in .env.');
}

const sourceUrl = new URL(originalDatabaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(sourceUrl.hostname)) {
  throw new Error('Phase 2 verification only creates temporary databases on a local PostgreSQL server.');
}

const testDatabase = `lockergo_verify_${randomUUID().replaceAll('-', '')}`;
const adminEmail = `phase2-admin-${randomUUID()}@example.test`;
const adminPassword = randomUUID() + randomUUID();
const maintenanceUrl = new URL(sourceUrl);
maintenanceUrl.pathname = '/postgres';
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${testDatabase}`;
let databaseCreated = false;
let maintenanceConnected = false;
let server: Server | undefined;
let disconnectDatabase: (() => Promise<void>) | undefined;

function quoteIdentifier(identifier: string): string {
  if (!/^lockergo_verify_[a-f0-9]{32}$/.test(identifier)) {
    throw new Error('Refusing to use an unexpected temporary database name.');
  }
  return `"${identifier}"`;
}

async function run(command: string[], extraEnv: Record<string, string> = {}): Promise<void> {
  const process = Bun.spawn(command, {
    cwd: backendDirectory,
    env: { ...globalThis.process.env, ...extraEnv, DATABASE_URL: testUrl.toString() },
    stdout: 'inherit',
    stderr: 'inherit'
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command.join(' ')}`);
  }
}

const maintenance = new Client({ connectionString: maintenanceUrl.toString() });

try {
  await maintenance.connect();
  maintenanceConnected = true;
  const access = await maintenance.query<{ database: string; can_create_database: boolean }>(
    `SELECT current_database() AS database,
            (SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user) AS can_create_database`
  );
  assert.equal(access.rows[0]?.database, 'postgres');
  assert.equal(access.rows[0]?.can_create_database, true, 'PostgreSQL role must be able to create a test database');

  const collision = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDatabase]);
  assert.equal(collision.rowCount, 0, 'Temporary test database name must be unused');
  await maintenance.query(`CREATE DATABASE ${quoteIdentifier(testDatabase)}`);
  databaseCreated = true;
  console.info('Created a uniquely named isolated PostgreSQL test database.');

  await run(['bunx', 'prisma', 'migrate', 'deploy']);
  await run(['bun', 'run', 'db:seed'], {
    ADMIN_NAME: 'Phase Two Verification Admin',
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword
  });

  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNAUTHENTICATED_DEVICE_ACCESS = 'false';
  process.env.JWT_SECRET = randomUUID() + randomUUID();
  process.env.JWT_REFRESH_SECRET = randomUUID() + randomUUID();
  process.env.CORS_ORIGIN = 'http://127.0.0.1:4200';

  const [{ app }, { prisma }] = await Promise.all([
    import('../src/app'),
    import('../src/lib/prisma')
  ]);
  disconnectDatabase = () => prisma.$disconnect();

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(
    path: string,
    options: { method?: string; token?: string; apiKey?: string; body?: unknown } = {}
  ): Promise<{ response: Response; data: Record<string, unknown> }> {
    const headers = new Headers();
    if (options.token) headers.set('authorization', `Bearer ${options.token}`);
    if (options.apiKey) headers.set('x-device-key', options.apiKey);
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
    const data = response.status === 204 ? {} : await response.json() as Record<string, unknown>;
    return { response, data };
  }

  const unauthenticated = await request('/api/lockers');
  assert.equal(unauthenticated.response.status, 401, 'Locker endpoints require authentication');

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword }
  });
  assert.equal(adminLogin.response.status, 200, 'Seeded admin can log in');
  const adminToken = adminLogin.data['accessToken'];
  assert.equal(typeof adminToken, 'string');

  const listedUsers = await request('/api/users', { token: adminToken as string });
  assert.equal(listedUsers.response.status, 200);
  const userItems = listedUsers.data['users'] as Array<Record<string, unknown>>;
  assert.ok(userItems.length >= 1);
  assert.ok(userItems.every((user) => !('passwordHash' in user)));

  const newUser = await request('/api/users', {
    method: 'POST',
    token: adminToken as string,
    body: {
      name: 'Phase Two Test User',
      email: `phase2-${randomUUID()}@example.test`,
      password: 'LockerGo-test-user-2026!',
      role: 'CLIENTE'
    }
  });
  assert.equal(newUser.response.status, 201, 'Admin can create a user');
  const user = newUser.data['user'] as Record<string, unknown>;
  const userId = user['id_user'] as number;
  assert.ok(!('passwordHash' in user));

  const newDepositor = await request('/api/users', {
    method: 'POST',
    token: adminToken as string,
    body: {
      name: 'Phase Two Test Depositor',
      email: `depositor-${randomUUID()}@example.test`,
      password: 'LockerGo-test-depositor-2026!',
      role: 'DEPOSITANTE'
    }
  });
  assert.equal(newDepositor.response.status, 201, 'Admin can create a depositor');
  const depositorId = (newDepositor.data['user'] as Record<string, unknown>)['id_user'] as number;

  const createLocker = async (suffix: string) => {
    const result = await request('/api/lockers', {
      method: 'POST',
      token: adminToken as string,
      body: { code: `phase2-${suffix}-${randomUUID().slice(0, 8)}`, name: `Test ${suffix}` }
    });
    assert.equal(result.response.status, 201, 'Admin can create a locker');
    return result.data['locker'] as Record<string, unknown>;
  };
  const assignedLocker = await createLocker('assigned');
  const unassignedLocker = await createLocker('private');
  const assignedLockerId = assignedLocker['id_locker'] as number;
  const packageCode = `phase2-package-${randomUUID()}`;

  const assignment = await request(`/api/users/${userId}/lockers`, {
    method: 'PUT',
    token: adminToken as string,
    body: { lockerIds: [assignedLockerId] }
  });
  assert.equal(assignment.response.status, 200, 'Admin can assign a locker to a user');

  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: user['email'], password: 'LockerGo-test-user-2026!' }
  });
  assert.equal(userLogin.response.status, 200, 'Created user can log in');
  const userToken = userLogin.data['accessToken'] as string;
  const depositorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: (newDepositor.data['user'] as Record<string, unknown>)['email'], password: 'LockerGo-test-depositor-2026!' }
  });
  assert.equal(depositorLogin.response.status, 200, 'Created depositor can log in');
  const depositorToken = depositorLogin.data['accessToken'] as string;
  const lockerOptions = await request('/api/packages/locker-options', { token: depositorToken });
  assert.equal(lockerOptions.response.status, 200, 'DEPOSITANTE can choose an active locker for registration');
  assert.ok(
    (lockerOptions.data['lockers'] as Array<Record<string, unknown>>)
      .some((locker) => locker['id_locker'] === assignedLockerId)
  );
  assert.equal(
    (await request('/api/packages/locker-options', { token: userToken })).response.status,
    403,
    'CLIENTE cannot browse package locker options'
  );
  assert.equal(
    (await request('/api/packages', { method: 'POST', token: userToken, body: {
      code: packageCode, lockerId: assignedLockerId, clientEmail: user['email']
    } })).response.status,
    403,
    'CLIENTE cannot pre-register packages'
  );
  const createPackage = await request('/api/packages', {
    method: 'POST',
    token: depositorToken,
    body: { code: packageCode, lockerId: assignedLockerId, clientEmail: user['email'] }
  });
  assert.equal(createPackage.response.status, 201, 'DEPOSITANTE can pre-register a package');
  const preregisteredPackage = (createPackage.data['package'] as Record<string, unknown>);
  assert.equal(preregisteredPackage['status'], 'PENDING');
  assert.equal(preregisteredPackage['depositedAt'], null);
  assert.equal(
    (await request('/api/packages', { token: userToken })).response.status,
    200,
    'CLIENTE can list own package records'
  );
  const depositorPackages = await request('/api/packages', { token: depositorToken });
  assert.equal(depositorPackages.response.status, 200);
  assert.equal(
    (depositorPackages.data['packages'] as Array<Record<string, unknown>>)[0]?.['code'],
    packageCode,
    'DEPOSITANTE sees only package records it created'
  );
  const adminPackages = await request('/api/packages', { token: adminToken as string });
  assert.equal(adminPackages.response.status, 200, 'ADMIN can list all packages');
  assert.equal(
    (await request('/api/dashboard/admin/overview', { token: userToken })).response.status,
    403,
    'CLIENTE cannot access global admin analytics'
  );

  const userLockers = await request('/api/lockers', { token: userToken });
  assert.equal(userLockers.response.status, 200);
  assert.deepEqual(
    (userLockers.data['lockers'] as Array<Record<string, unknown>>).map((locker) => locker['id_locker']),
    [assignedLockerId],
    'User only sees the assigned active locker'
  );
  assert.equal(
    (await request(`/api/lockers/${unassignedLocker['id_locker']}`, { token: userToken })).response.status,
    404,
    'User cannot access an unassigned locker'
  );
  assert.equal(
    (await request(`/api/lockers/${unassignedLocker['id_locker']}/state`, { token: userToken })).response.status,
    404,
    'User cannot read the state of an unassigned locker'
  );
  assert.equal(
    (await request(`/api/lockers/${assignedLockerId}/readings`)).response.status,
    401,
    'Reading history requires authentication'
  );
  assert.equal(
    (await request('/api/devices', { token: userToken })).response.status,
    403,
    'User cannot access admin-only device endpoints'
  );

  const catalogResult = await request('/api/catalog/types', { token: userToken });
  assert.equal(catalogResult.response.status, 200, 'Authenticated users can read the catalog');
  const doorType = (catalogResult.data['types'] as Array<Record<string, unknown>>)
    .find((type) => type['code'] === 'door_contact');
  assert.ok(doorType, 'Seed includes the door contact component type');
  const doorModel = (doorType['models'] as Array<Record<string, unknown>>)
    .find((model) => model['code'] === 'mc-38');
  assert.ok(doorModel, 'Seed includes the MC-38 model');
  const distanceType = (catalogResult.data['types'] as Array<Record<string, unknown>>)
    .find((type) => type['code'] === 'distance');
  assert.ok(distanceType, 'Seed includes the distance component type');
  const distanceModel = (distanceType['models'] as Array<Record<string, unknown>>)
    .find((model) => model['code'] === 'hc-sr04');
  assert.ok(distanceModel, 'Seed includes the HC-SR04 model');
  const proximityType = (catalogResult.data['types'] as Array<Record<string, unknown>>)
    .find((type) => type['code'] === 'proximity');
  assert.ok(proximityType, 'Seed includes the proximity component type');
  const proximityModel = (proximityType['models'] as Array<Record<string, unknown>>)
    .find((model) => model['code'] === 'fc-51');
  assert.ok(proximityModel, 'Seed includes the FC-51 model');

  const createDevice = await request('/api/devices', {
    method: 'POST',
    token: adminToken as string,
    body: { code: `phase2-device-${randomUUID().slice(0, 8)}`, lockerId: assignedLockerId }
  });
  assert.equal(createDevice.response.status, 201, 'Admin can create a device for an active locker');
  const device = createDevice.data['device'] as Record<string, unknown>;
  const apiKey = createDevice.data['apiKey'];
  const deviceId = device['id_device'] as number;
  assert.equal(typeof apiKey, 'string', 'New device key is returned at creation');
  assert.ok(!('apiKeyHash' in device), 'Device key hash is not exposed');
  assert.equal(device['configVersion'], 1);

  const invalidKey = await request(`/api/devices/${device['code']}/config`, { apiKey: 'wrong-key' });
  assert.equal(invalidKey.response.status, 401, 'Device configuration requires its API key');

  const addComponent = await request(`/api/devices/${deviceId}/components`, {
    method: 'POST',
    token: adminToken as string,
    body: {
      modelId: doorModel['id_cm'],
      key: 'door-1',
      name: 'Main door contact',
      config: { signalPin: 32 }
    }
  });
  assert.equal(addComponent.response.status, 201, 'Admin can configure a component');
  const component = addComponent.data['component'] as Record<string, unknown>;
  assert.equal(component['modelId'], doorModel['id_cm']);

  const addDistanceComponent = await request(`/api/devices/${deviceId}/components`, {
    method: 'POST',
    token: adminToken as string,
    body: {
      modelId: distanceModel['id_cm'],
      key: 'distance-1',
      name: 'Ultrasonic distance',
      config: { triggerPin: 25, echoPin: 19, intervalMs: 1000 },
      calibration: { emptyDistanceCm: 20 }
    }
  });
  assert.equal(addDistanceComponent.response.status, 201, 'Admin can configure the HC-SR04 component');
  const distanceComponent = addDistanceComponent.data['component'] as Record<string, unknown>;
  const addProximityComponent = await request(`/api/devices/${deviceId}/components`, {
    method: 'POST',
    token: adminToken as string,
    body: {
      modelId: proximityModel['id_cm'],
      key: 'proximity-1',
      name: 'Package presence',
      config: { signalPin: 27 }
    }
  });
  assert.equal(addProximityComponent.response.status, 201, 'Admin can configure the FC-51 component');
  const proximityComponent = addProximityComponent.data['component'] as Record<string, unknown>;

  const deviceConfig = await request(`/api/devices/${device['code']}/config`, { apiKey: apiKey as string });
  assert.equal(deviceConfig.response.status, 200);
  assert.equal(deviceConfig.data['configVersion'], 4, 'Adding components increments configVersion');
  const configComponent = (deviceConfig.data['components'] as Array<Record<string, unknown>>)[0];
  assert.deepEqual(configComponent['config'], {
    signalPin: 32,
    pull: 'up',
    intervalMs: 100
  }, 'Device config merges model defaults with instance config');

  const nowSeconds = Date.now() / 1000;
  const ingest = await request('/api/ingest/v1/readings', {
    method: 'POST',
    apiKey: apiKey as string,
    body: {
      deviceCode: device['code'],
      firmware: 'phase2-test',
      readings: [
        { component: 'door-1', value: true, ts: nowSeconds },
        { component: 'door-1', value: false, ts: nowSeconds + 1 },
        { component: 'proximity-1', value: false, ts: nowSeconds + 1 },
        { component: 'missing-component', value: true },
        { component: 'door-1', value: 'not-a-boolean' },
        { component: 'distance-1', value: null, quality: 'ERROR' }
      ]
    }
  });
  assert.equal(ingest.response.status, 202);
  assert.deepEqual(ingest.data, {
    accepted: 4,
    rejected: [
      { component: 'missing-component', reason: 'Unknown or disabled component' },
      { component: 'door-1', reason: 'Value does not match BOOLEAN' }
    ]
  }, 'Invalid records are rejected without discarding valid readings in the batch');

  const readings = await prisma.reading.findMany({
    where: { componentId: component['id_component'] as number },
    orderBy: { id_reading: 'asc' },
    select: { valueBool: true, lockerId: true, quality: true }
  });
  assert.equal(readings.length, 2, 'Both valid readings are persisted');
  assert.deepEqual(readings.map((reading) => reading.valueBool), [true, false]);
  assert.ok(readings.every((reading) => reading.lockerId === assignedLockerId));

  const events = await prisma.event.findMany({
    where: { lockerId: assignedLockerId, componentId: component['id_component'] as number },
    select: { type: true, severity: true, readingId: true }
  });
  assert.equal(events.length, 1, 'A state transition within one batch derives one event');
  assert.equal(events[0]?.type, 'DOOR_OPENED');
  assert.equal(events[0]?.severity, 'INFO');
  const sensorErrorEvents = await prisma.event.findMany({
    where: { lockerId: assignedLockerId, componentId: distanceComponent['id_component'] as number },
    select: { type: true, severity: true }
  });
  assert.deepEqual(
    sensorErrorEvents.map(({ type, severity }) => ({ type, severity })),
    [{ type: 'SENSOR_ERROR', severity: 'CRITICAL' }],
    'A null reading marked ERROR persists and creates a sensor-error event'
  );

  const packageDeposit = await request('/api/ingest/v1/readings', {
    method: 'POST',
    apiKey: apiKey as string,
    body: {
      deviceCode: device['code'],
      readings: [
        { component: 'distance-1', value: 14, ts: nowSeconds + 3 },
        { component: 'proximity-1', value: true, ts: nowSeconds + 3 },
        { component: 'door-1', value: true, ts: nowSeconds + 3 }
      ]
    }
  });
  assert.equal(packageDeposit.response.status, 202);
  const depositedPackage = await prisma.package.findUnique({
    where: { code: packageCode },
    select: { status: true, depositedAt: true, pickedUpAt: true, estimatedSize: true }
  });
  assert.equal(depositedPackage?.status, 'PENDING');
  assert.ok(depositedPackage?.depositedAt instanceof Date);
  assert.equal(depositedPackage?.pickedUpAt, null);
  assert.equal(depositedPackage?.estimatedSize, 'S', 'A 6 cm estimated package height is size S');
  const depositEvents = await prisma.event.findMany({
    where: { package: { code: packageCode } },
    select: { type: true, packageId: true }
  });
  assert.deepEqual(depositEvents.map(({ type }) => type), ['PACKAGE_DEPOSITED']);

  const packagePickup = await request('/api/ingest/v1/readings', {
    method: 'POST',
    apiKey: apiKey as string,
    body: {
      deviceCode: device['code'],
      readings: [
        { component: 'door-1', value: false, ts: nowSeconds + 4 },
        { component: 'proximity-1', value: false, ts: nowSeconds + 5 },
        { component: 'door-1', value: true, ts: nowSeconds + 5 }
      ]
    }
  });
  assert.equal(packagePickup.response.status, 202);
  const pickedUpPackage = await prisma.package.findUnique({
    where: { code: packageCode },
    select: { status: true, depositedAt: true, pickedUpAt: true }
  });
  assert.equal(pickedUpPackage?.status, 'PICKED_UP');
  assert.ok(pickedUpPackage?.depositedAt instanceof Date);
  assert.ok(pickedUpPackage?.pickedUpAt instanceof Date);
  const clientPackages = await request('/api/packages', { token: userToken });
  assert.ok(
    (clientPackages.data['packages'] as Array<Record<string, unknown>>)
      .some((item) => item['code'] === packageCode),
    'CLIENTE sees its own package after pickup'
  );
  const dashboardOverview = await request('/api/dashboard/admin/overview', {
    token: adminToken as string
  });
  assert.equal(dashboardOverview.response.status, 200);
  assert.equal(
    typeof (dashboardOverview.data['kpis'] as Record<string, unknown>)['doorOpeningsToday'],
    'number',
    'Global admin dashboard returns door activity KPIs'
  );
  assert.ok(
    (dashboardOverview.data['packagesByStatus'] as Array<Record<string, unknown>>)
      .some((item) => item['status'] === 'PICKED_UP' && item['count'] === 1),
    'Global admin dashboard aggregates package counts by status'
  );
  assert.ok(
    (dashboardOverview.data['packageSizeDistribution'] as Array<Record<string, unknown>>)
      .some((item) => item['size'] === 'S' && item['count'] === 1),
    'Global admin dashboard aggregates packages with estimated sizes'
  );
  assert.ok(
    (dashboardOverview.data['packageSizeDistribution'] as Array<Record<string, unknown>>)
      .some((item) => item['size'] === null && item['count'] === 0),
    'Global admin dashboard includes packages without a valid size estimate'
  );
  const lockerAnalytics = await request(`/api/lockers/${assignedLockerId}/analytics`, {
    token: adminToken as string
  });
  assert.equal(lockerAnalytics.response.status, 200);
  assert.ok(
    (lockerAnalytics.data['packageSizeDistribution'] as Array<Record<string, unknown>>)
      .some((item) => item['size'] === 'S' && item['count'] === 1),
    'Locker analytics aggregates package sizes'
  );
  assert.equal(
    (await request(`/api/lockers/${assignedLockerId}/analytics`, { token: userToken })).response.status,
    403,
    'CLIENTE cannot access admin locker analytics'
  );
  await assert.rejects(
    prisma.package.update({
      where: { code: packageCode },
      data: { status: 'PENDING' }
    }),
    'Picked-up packages must retain a pickup timestamp'
  );

  const overview = await request('/api/lockers/overview', { token: userToken });
  assert.equal(overview.response.status, 200);
  assert.deepEqual(
    (overview.data['lockers'] as Array<Record<string, unknown>>).map((locker) => locker['id_locker']),
    [assignedLockerId],
    'Locker overview observes the same assignment restrictions'
  );
  assert.equal((overview.data['lockers'] as Array<Record<string, unknown>>)[0]?.['onlineDeviceCount'], 1);

  const lockerState = await request(`/api/lockers/${assignedLockerId}/state`, { token: userToken });
  assert.equal(lockerState.response.status, 200);
  const stateDevices = lockerState.data['devices'] as Array<Record<string, unknown>>;
  assert.equal(stateDevices.length, 1);
  assert.equal(stateDevices[0]?.['connectionStatus'], 'ONLINE');
  const stateComponents = stateDevices[0]?.['components'] as Array<Record<string, unknown>>;
  const latestReading = stateComponents[0]?.['latestReading'] as Record<string, unknown>;
  assert.equal(typeof latestReading['id_reading'], 'string', 'BigInt reading IDs are JSON-safe strings');
  assert.equal(latestReading['valueBool'], true, 'Locker state reflects the most recent live door reading');

  const history = await request(`/api/lockers/${assignedLockerId}/readings?limit=10`, { token: userToken });
  assert.equal(history.response.status, 200);
  assert.equal((history.data['readings'] as Array<Record<string, unknown>>).length, 10);
  const distanceHistory = await request(
    `/api/lockers/${assignedLockerId}/readings?componentId=${distanceComponent['id_component']}`,
    { token: userToken }
  );
  assert.equal(distanceHistory.response.status, 200);
  const latestDistanceReading = (distanceHistory.data['readings'] as Array<Record<string, unknown>>)[0];
  assert.equal(latestDistanceReading?.['valueNum'], 14);
  assert.equal(latestDistanceReading?.['quality'], 'OK');
  const eventHistory = await request(
    `/api/lockers/${assignedLockerId}/events?type=DOOR_OPENED&severity=INFO`,
    { token: userToken }
  );
  assert.equal(eventHistory.response.status, 200);
  assert.equal((eventHistory.data['events'] as Array<Record<string, unknown>>)[0]?.['type'], 'DOOR_OPENED');
  const sensorErrorHistory = await request(
    `/api/lockers/${assignedLockerId}/events?severity=CRITICAL`,
    { token: userToken }
  );
  assert.equal((sensorErrorHistory.data['events'] as Array<Record<string, unknown>>)[0]?.['type'], 'SENSOR_ERROR');

  const ticketResult = await request(`/api/lockers/${assignedLockerId}/stream-ticket`, {
    method: 'POST',
    token: userToken
  });
  assert.equal(ticketResult.response.status, 200, 'Assigned user can request a scoped SSE ticket');
  const streamTicket = ticketResult.data['ticket'] as string;
  assert.ok(streamTicket.length >= 40);
  assert.equal(
    (await fetch(`${baseUrl}/api/lockers/${unassignedLocker['id_locker']}/stream?ticket=${streamTicket}`)).status,
    401,
    'Stream ticket cannot be reused for another locker'
  );

  const streamAbortController = new AbortController();
  const streamResponse = await fetch(
    `${baseUrl}/api/lockers/${assignedLockerId}/stream?ticket=${encodeURIComponent(streamTicket)}`,
    { headers: { accept: 'text/event-stream' }, signal: streamAbortController.signal }
  );
  assert.equal(streamResponse.status, 200);
  if (!streamResponse.body) throw new Error('SSE response has no readable stream');
  const streamReader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  async function readUntil(expected: string): Promise<string> {
    let received = '';
    const deadline = Date.now() + 5000;
    while (!received.includes(expected) && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for SSE ${expected}`)), remaining);
      });
      let chunk: Awaited<ReturnType<typeof streamReader.read>>;
      try {
        chunk = await Promise.race([streamReader.read(), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (chunk.done) break;
      received += decoder.decode(chunk.value, { stream: true });
    }
    assert.ok(received.includes(expected), `SSE stream emits ${expected}`);
    return received;
  }
  assert.equal(
    (await request('/api/packages/stream-ticket', {
      method: 'POST',
      token: adminToken as string
    })).response.status,
    403,
    'ADMIN uses the admin locker streams, not the personal package stream'
  );
  const packageStreamTicketResult = await request('/api/packages/stream-ticket', {
    method: 'POST',
    token: depositorToken
  });
  assert.equal(packageStreamTicketResult.response.status, 200);
  const packageStreamAbort = new AbortController();
  const packageStreamResponse = await fetch(
    `${baseUrl}/api/packages/stream?ticket=${encodeURIComponent(packageStreamTicketResult.data['ticket'] as string)}&lastEventId=1`,
    { headers: { accept: 'text/event-stream' }, signal: packageStreamAbort.signal }
  );
  assert.equal(packageStreamResponse.status, 200, 'DEPOSITANTE can subscribe to its package stream');
  if (!packageStreamResponse.body) throw new Error('Package SSE response has no readable stream');
  const packageStreamReader = packageStreamResponse.body.getReader();
  const packageDecoder = new TextDecoder();
  let packageUpdateText = '';
  const packageDeadline = Date.now() + 5000;
  while (!packageUpdateText.includes('event: package.update') && Date.now() < packageDeadline) {
    const chunk = await packageStreamReader.read();
    if (chunk.done) break;
    packageUpdateText += packageDecoder.decode(chunk.value, { stream: true });
  }
  assert.ok(packageUpdateText.includes('event: package.update'), 'Package stream replays package changes');
  assert.ok(packageUpdateText.includes(`"code":"${packageCode}"`), 'DEPOSITANTE receives its package code');
  assert.ok(packageUpdateText.includes('"status":"PICKED_UP"'), 'Package stream carries the latest package status');
  packageStreamAbort.abort();
  await packageStreamReader.cancel();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  await readUntil('event: ready');
  const liveIngest = await request('/api/ingest/v1/readings', {
    method: 'POST',
    apiKey: apiKey as string,
    body: {
      deviceCode: device['code'],
      readings: [{ component: 'door-1', value: true, ts: Date.now() / 1000 }]
    }
  });
  assert.equal(liveIngest.response.status, 202);
  const liveUpdate = await readUntil('event: locker.update');
  assert.ok(liveUpdate.includes('"valueBool":true'), 'SSE update carries the ingested reading');
  streamAbortController.abort();
  await streamReader.cancel();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const storedDevice = await prisma.device.findUnique({
    where: { id_device: deviceId },
    select: { lastSeenAt: true, firmwareVersion: true, apiKeyHash: true }
  });
  assert.ok(storedDevice?.lastSeenAt);
  assert.equal(storedDevice.firmwareVersion, 'phase2-test');
  assert.notEqual(storedDevice.apiKeyHash, apiKey, 'Only a hash of the device key is stored');

  const rotateKey = await request(`/api/devices/${deviceId}/rotate-key`, {
    method: 'POST',
    token: adminToken as string
  });
  assert.equal(rotateKey.response.status, 200);
  const rotatedKey = rotateKey.data['apiKey'] as string;
  assert.equal(
    (await request(`/api/devices/${device['code']}/config`, { apiKey: apiKey as string })).response.status,
    401,
    'Old device key is invalidated after rotation'
  );
  assert.equal(
    (await request(`/api/devices/${device['code']}/config`, { apiKey: rotatedKey })).response.status,
    200,
    'Rotated device key grants access'
  );

  console.info('Phase 2/3 verification passed: package lifecycle, role-filtered access, analytics, SSE, ingestion, and key rotation.');

  server.closeAllConnections();
  server = undefined;
} finally {
  if (server) {
    server.closeAllConnections();
    server = undefined;
  }
  await disconnectDatabase?.();
  if (databaseCreated) {
    await maintenance.query(`DROP DATABASE ${quoteIdentifier(testDatabase)} WITH (FORCE)`);
    console.info('Dropped the isolated verification database.');
  }
  if (maintenanceConnected) await maintenance.end();
  if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
}
