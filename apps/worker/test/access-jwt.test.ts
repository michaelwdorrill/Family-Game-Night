import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAccessJwksCacheForTests, verifyAccessJwt } from '../src/auth/access-jwt';

import type { AppConfig } from '../src/env';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const config: AppConfig = {
  environment: 'production',
  appOrigin: 'https://games.example.com',
  adminEmail: 'admin@example.com',
  accessTeamDomain: 'family.cloudflareaccess.com',
  accessAudience: 'expected-audience',
};

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function keys(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
}

async function token(
  privateKey: CryptoKey,
  claims: Readonly<Record<string, unknown>>,
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

async function verifier(privateClaims: Readonly<Record<string, unknown>>) {
  const keyPair = await keys();
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const fetchKeys = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key', use: 'sig' }] }),
    );
  return {
    jwt: await token(keyPair.privateKey, privateClaims),
    dependencies: { fetch: fetchKeys, now: () => NOW },
    fetchKeys,
  };
}

function validClaims(): Readonly<Record<string, unknown>> {
  return {
    aud: ['other-audience', 'expected-audience'],
    email: 'Family.Member@Example.com',
    exp: Math.floor(NOW / 1000) + 300,
    nbf: Math.floor(NOW / 1000) - 30,
    iss: 'https://family.cloudflareaccess.com',
    sub: 'access-user',
  };
}

describe('Cloudflare Access JWT validation', () => {
  beforeEach(() => clearAccessJwksCacheForTests());

  it('verifies signature and claims, normalizes email, and caches JWKS', async () => {
    const fixture = await verifier(validClaims());

    await expect(verifyAccessJwt(fixture.jwt, config, fixture.dependencies)).resolves.toEqual({
      email: 'family.member@example.com',
    });
    await expect(verifyAccessJwt(fixture.jwt, config, fixture.dependencies)).resolves.toEqual({
      email: 'family.member@example.com',
    });
    expect(fixture.fetchKeys).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['issuer', { ...validClaims(), iss: 'https://attacker.example.com' }],
    ['audience', { ...validClaims(), aud: 'wrong-audience' }],
    ['expiration', { ...validClaims(), exp: Math.floor(NOW / 1000) - 31 }],
    ['not-before', { ...validClaims(), nbf: Math.floor(NOW / 1000) + 31 }],
  ])('rejects an invalid %s claim', async (_name, claims) => {
    const fixture = await verifier(claims);
    await expect(verifyAccessJwt(fixture.jwt, config, fixture.dependencies)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a token whose signature does not match the advertised key', async () => {
    const signed = await verifier(validClaims());
    clearAccessJwksCacheForTests();
    const advertised = await verifier(validClaims());

    await expect(
      verifyAccessJwt(signed.jwt, config, advertised.dependencies),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
});
