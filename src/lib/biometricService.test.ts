/**
 * Unit tests for src/lib/biometricService.ts
 *
 * Test strategy
 * ─────────────
 * • All external I/O (fetch, WebAuthn browser API, Dexie, Supabase) is
 *   mocked via globalThis / mock-loader.mjs so no real network calls occur.
 * • Tests are grouped by function and failure scenario.
 * • Style follows the repo convention: node:test + node:assert, ESM imports.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Browser environment shims ────────────────────────────────────────────────

Object.defineProperty(global, 'window', {
  value: {
    location: { hostname: 'localhost', protocol: 'https:', origin: 'https://localhost' },
    PublicKeyCredential: {},
  },
  writable: true,
});

Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true,
});

// ─── Fetch mock infrastructure ────────────────────────────────────────────────

type FetchHandler = (input: string, init?: RequestInit) => Promise<Response>;
let fetchMock: FetchHandler = async () => { throw new Error('fetch not configured'); };
Object.defineProperty(global, 'fetch', {
  get: () => fetchMock,
  configurable: true,
});

function mockFetch(handler: FetchHandler) {
  fetchMock = handler;
}

function respondJson(status: number, body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

// ─── WebAuthn browser mock infrastructure ─────────────────────────────────────

(globalThis as any).__swaBrowserMock = {
  startRegistration: async () => ({ id: 'cred-id', response: {}, type: 'public-key' }),
  startAuthentication: async () => ({ id: 'cred-id', response: {}, type: 'public-key' }),
};

// ─── Dexie mock ───────────────────────────────────────────────────────────────

// biometricService imports `db` from '../db/db'. We stub it via globalThis so
// the hasRegisteredFingerprint function can be tested without a real IndexedDB.
// The mock-loader.mjs handles the @supabase/supabase-js and @simplewebauthn/browser
// stubs; we handle db here by patching the module after import.

// ─── Module under test ────────────────────────────────────────────────────────

const {
  FingerprintError,
  checkFingerprintSupport,
  registerStudentFingerprint,
  verifyStudentFingerprint,
  hasRegisteredFingerprint,
} = await import('./biometricService.ts');

// Patch db.studentCredentials so hasRegisteredFingerprint can be tested
// (The module already imported db; we reach into it via the exported module
//  object is not feasible, but we can test through the public function by
//  controlling the db module. Since mock-loader doesn't mock dexie, we patch
//  the imported db object directly via monkey-patching after import.)
const dbModule = await import('../db/db.ts');
const dbAny = dbModule.db as any;

function setCredentialsCount(n: number) {
  dbAny.studentCredentials = {
    where: () => ({
      equals: () => ({
        filter: () => ({ count: async () => n }),
        anyOf: () => ({ filter: () => ({ toArray: async () => [] }) }),
        toArray: async () => [],
        first: async () => null,
      }),
    }),
  };
}

const STUDENT = {
  id: 1,
  serverId: 'student-abc',
  regNumber: '2020000001',
  name: 'Alice Example',
  isDeleted: 0 as const,
  synced: 0 as const,
};

// ─── checkFingerprintSupport ──────────────────────────────────────────────────

describe('checkFingerprintSupport', () => {
  test('returns supported=true on https localhost', () => {
    const result = checkFingerprintSupport();
    assert.equal(result.supported, true);
  });

  test('returns supported=false when PublicKeyCredential missing', () => {
    const original = (global as any).window;
    (global as any).window = { location: { hostname: 'localhost', protocol: 'https:' } };
    const result = checkFingerprintSupport();
    assert.equal(result.supported, false);
    assert.ok(result.reason?.includes('not supported'));
    (global as any).window = original;
  });

  test('returns supported=false on plain http non-localhost', () => {
    const original = (global as any).window;
    (global as any).window = {
      PublicKeyCredential: {},
      location: { hostname: 'example.com', protocol: 'http:' },
    };
    const result = checkFingerprintSupport();
    assert.equal(result.supported, false);
    assert.ok(result.reason?.includes('HTTPS'));
    (global as any).window = original;
  });
});

// ─── FingerprintError ─────────────────────────────────────────────────────────

describe('FingerprintError', () => {
  test('stores code and retriable flag', () => {
    const err = new FingerprintError('OFFLINE', 'No connection', false);
    assert.equal(err.code, 'OFFLINE');
    assert.equal(err.retriable, false);
    assert.equal(err.message, 'No connection');
    assert.equal(err.name, 'FingerprintError');
  });

  test('is an instance of Error', () => {
    const err = new FingerprintError('UNKNOWN', 'x', true);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof FingerprintError);
  });
});

// ─── hasRegisteredFingerprint ─────────────────────────────────────────────────

describe('hasRegisteredFingerprint', () => {
  test('returns true when credential count > 0', async () => {
    setCredentialsCount(1);
    const result = await hasRegisteredFingerprint('student-abc');
    assert.equal(result, true);
  });

  test('returns false when credential count = 0', async () => {
    setCredentialsCount(0);
    const result = await hasRegisteredFingerprint('student-abc');
    assert.equal(result, false);
  });
});

// ─── registerStudentFingerprint ───────────────────────────────────────────────

describe('registerStudentFingerprint', () => {
  beforeEach(() => {
    // Reset to successful browser mock
    (globalThis as any).__swaBrowserMock.startRegistration = async () => ({
      id: 'cred-id', response: {}, type: 'public-key',
    });
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true });
  });

  test('resolves on fully successful flow', async () => {
    mockFetch(async (url) => {
      if (url.includes('generate-registration-options')) {
        return respondJson(200, { challenge: 'abc', rp: {}, user: {}, pubKeyCredParams: [] });
      }
      if (url.includes('verify-registration')) {
        return respondJson(200, { verified: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await assert.doesNotReject(() => registerStudentFingerprint(STUDENT, 'user-1'));
  });

  test('falls back to POST when GET options request fails to fetch', async () => {
    let optionsAttempts = 0;
    mockFetch(async (url, init) => {
      if (url.includes('generate-registration-options')) {
        optionsAttempts += 1;
        if ((init?.method ?? 'GET') === 'GET') {
          throw new TypeError('Failed to fetch');
        }
        return respondJson(200, { challenge: 'abc', rp: {}, user: {}, pubKeyCredParams: [] });
      }
      if (url.includes('verify-registration')) {
        return respondJson(200, { verified: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await assert.doesNotReject(() => registerStudentFingerprint(STUDENT, 'user-1'));
    assert.equal(optionsAttempts, 2);
  });

  test('throws FingerprintError NETWORK_ERROR when options fetch fails', async () => {
    mockFetch(async () => { throw new TypeError('Failed to fetch'); });

    await assert.rejects(
      () => registerStudentFingerprint(STUDENT, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        // Either NETWORK_ERROR or OFFLINE depending on navigator.onLine
        assert.ok(['NETWORK_ERROR', 'OFFLINE'].includes(err.code));
        return true;
      },
    );
  });

  test('throws FingerprintError OFFLINE when navigator is offline', async () => {
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true });
    mockFetch(async () => { throw new TypeError('Failed to fetch'); });

    await assert.rejects(
      () => registerStudentFingerprint(STUDENT, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'OFFLINE');
        assert.equal(err.retriable, false);
        return true;
      },
    );
  });

  test('throws FingerprintError CHALLENGE_EXPIRED on 400 challenge error', async () => {
    mockFetch(async (url) => {
      if (url.includes('generate-registration-options')) {
        return respondJson(200, { challenge: 'abc' });
      }
      if (url.includes('verify-registration')) {
        return respondJson(400, { error: 'challenge expired or invalid' });
      }
      throw new Error(`Unexpected: ${url}`);
    });

    await assert.rejects(
      () => registerStudentFingerprint(STUDENT, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'CHALLENGE_EXPIRED');
        assert.equal(err.retriable, true);
        return true;
      },
    );
  });

  test('throws FingerprintError VERIFICATION_FAILED when server returns verified=false', async () => {
    mockFetch(async (url) => {
      if (url.includes('generate-registration-options')) return respondJson(200, { challenge: 'abc' });
      if (url.includes('verify-registration')) return respondJson(200, { verified: false });
      throw new Error(`Unexpected: ${url}`);
    });

    await assert.rejects(
      () => registerStudentFingerprint(STUDENT, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'VERIFICATION_FAILED');
        assert.equal(err.retriable, true);
        return true;
      },
    );
  });

  test('throws FingerprintError NOT_ALLOWED when browser ceremony is cancelled', async () => {
    (globalThis as any).__swaBrowserMock.startRegistration = async () => {
      const e = new Error('NotAllowedError: The operation was not allowed');
      e.name = 'NotAllowedError';
      throw e;
    };
    mockFetch(async (url) => {
      if (url.includes('generate-registration-options')) return respondJson(200, { challenge: 'abc' });
      throw new Error(`Unexpected: ${url}`);
    });

    await assert.rejects(
      () => registerStudentFingerprint(STUDENT, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'NOT_ALLOWED');
        assert.equal(err.retriable, true);
        return true;
      },
    );
  });

  test('throws FingerprintError UNSUPPORTED when WebAuthn is unavailable', async () => {
    const original = (global as any).window;
    (global as any).window = { location: { hostname: 'localhost', protocol: 'https:' } }; // no PublicKeyCredential

    await assert.rejects(
      () => registerStudentFingerprint(STUDENT, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'UNSUPPORTED');
        assert.equal(err.retriable, false);
        return true;
      },
    );

    (global as any).window = original;
  });

  test('throws FingerprintError on 500 server error (retriable)', async () => {
    mockFetch(async (url) => {
      if (url.includes('generate-registration-options')) return respondJson(200, { challenge: 'abc' });
      if (url.includes('verify-registration')) return respondJson(500, { error: 'internal server error' });
      throw new Error(`Unexpected: ${url}`);
    });

    await assert.rejects(
      () => registerStudentFingerprint(STUDENT, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.equal(err.retriable, true);
        return true;
      },
    );
  });
});

// ─── verifyStudentFingerprint ─────────────────────────────────────────────────

describe('verifyStudentFingerprint', () => {
  beforeEach(() => {
    (globalThis as any).__swaBrowserMock.startAuthentication = async () => ({
      id: 'cred-id', response: {}, type: 'public-key',
    });
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true });
  });

  test('resolves on fully successful flow', async () => {
    mockFetch(async (url) => {
      if (url.includes('generate-authentication-options')) {
        return respondJson(200, { challenge: 'abc', rpId: 'localhost', allowCredentials: [] });
      }
      if (url.includes('verify-authentication')) {
        return respondJson(200, { verified: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await assert.doesNotReject(() => verifyStudentFingerprint(STUDENT));
  });

  test('throws OFFLINE immediately when navigator.onLine is false', async () => {
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true });

    await assert.rejects(
      () => verifyStudentFingerprint(STUDENT),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'OFFLINE');
        assert.equal(err.retriable, false);
        return true;
      },
    );
  });

  test('throws CREDENTIAL_NOT_FOUND on 404 from options endpoint', async () => {
    mockFetch(async () => respondJson(404, { error: 'credential not found' }));

    await assert.rejects(
      () => verifyStudentFingerprint(STUDENT),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'CREDENTIAL_NOT_FOUND');
        assert.equal(err.retriable, false);
        return true;
      },
    );
  });

  test('throws VERIFICATION_FAILED when server returns verified=false', async () => {
    mockFetch(async (url) => {
      if (url.includes('generate-authentication-options')) return respondJson(200, { challenge: 'abc' });
      if (url.includes('verify-authentication')) return respondJson(200, { verified: false });
      throw new Error(`Unexpected: ${url}`);
    });

    await assert.rejects(
      () => verifyStudentFingerprint(STUDENT),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'VERIFICATION_FAILED');
        assert.equal(err.retriable, true);
        return true;
      },
    );
  });

  test('throws NOT_ALLOWED when authentication ceremony is cancelled', async () => {
    (globalThis as any).__swaBrowserMock.startAuthentication = async () => {
      const e = new Error('NotAllowedError: The operation was cancelled by the user');
      e.name = 'NotAllowedError';
      throw e;
    };
    mockFetch(async (url) => {
      if (url.includes('generate-authentication-options')) return respondJson(200, { challenge: 'abc' });
      throw new Error(`Unexpected: ${url}`);
    });

    await assert.rejects(
      () => verifyStudentFingerprint(STUDENT),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'NOT_ALLOWED');
        assert.equal(err.retriable, true);
        return true;
      },
    );
  });

  test('throws CHALLENGE_EXPIRED on 400 with challenge keyword', async () => {
    mockFetch(async (url) => {
      if (url.includes('generate-authentication-options')) return respondJson(200, { challenge: 'abc' });
      if (url.includes('verify-authentication')) return respondJson(400, { error: 'challenge has expired' });
      throw new Error(`Unexpected: ${url}`);
    });

    await assert.rejects(
      () => verifyStudentFingerprint(STUDENT),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.equal(err.code, 'CHALLENGE_EXPIRED');
        assert.equal(err.retriable, true);
        return true;
      },
    );
  });

  test('throws NETWORK_ERROR when fetch throws during options request', async () => {
    mockFetch(async () => { throw new TypeError('NetworkError'); });

    await assert.rejects(
      () => verifyStudentFingerprint(STUDENT),
      (err: any) => {
        assert.ok(err instanceof FingerprintError);
        assert.ok(['NETWORK_ERROR', 'OFFLINE'].includes(err.code));
        return true;
      },
    );
  });
});
