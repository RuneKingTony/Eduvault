const REQUIRED = [
  'API_URL',
  'WEB_ADMIN_URL',
  'WEB_PORTAL_URL',
  'SMOKE_EMAIL',
  'SMOKE_PASSWORD',
] as const;

type Name = (typeof REQUIRED)[number];

const missing = REQUIRED.filter((name) => (process.env[name] ?? '') === '');
if (missing.length > 0) {
  console.error(`Missing environment: ${missing.join(', ')}`);
  process.exit(2);
}

const env = (name: Name): string =>
  (process.env[name] ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 30_000;
const get = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

async function expectOk(url: string, init?: Promise<Response>) {
  const res = await (init ?? get(url));
  if (!res.ok) {
    throw new Error(`${url} answered ${res.status}`);
  }
  return res;
}

async function expectApp(url: string) {
  const res = await expectOk(url);
  const html = await res.text();
  if (!html.includes('<div id="root"')) {
    throw new Error(`${url} did not serve the app shell`);
  }
}

async function signIn() {
  const res = await expectOk(
    `${env('API_URL')}/api/auth/sign-in/email`,
    fetch(`${env('API_URL')}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env('WEB_ADMIN_URL'),
      },
      body: JSON.stringify({
        email: process.env['SMOKE_EMAIL'],
        password: process.env['SMOKE_PASSWORD'],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  );
  if (res.headers.getSetCookie().length === 0) {
    throw new Error('sign-in answered 200 but set no session cookie');
  }
}

const steps: [string, () => Promise<unknown>][] = [
  ['API health', () => expectOk(`${env('API_URL')}/health`)],
  ['web-admin loads', () => expectApp(env('WEB_ADMIN_URL'))],
  ['web-portal loads', () => expectApp(env('WEB_PORTAL_URL'))],
  ['bootstrap admin signs in', signIn],
];

async function main(): Promise<number> {
  for (const [name, run] of steps) {
    try {
      await run();
      console.log(`ok    ${name}`);
    } catch (error) {
      console.error(
        `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 1;
    }
  }
  return 0;
}

void main().then((code) => process.exit(code));
