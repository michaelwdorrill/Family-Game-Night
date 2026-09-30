import { z } from 'zod';

import { emailSchema } from '@family-game-night/shared';

import { ApiError } from '../errors';

import type { AppConfig } from '../env';

const jwtHeaderSchema = z
  .object({
    alg: z.literal('RS256'),
    kid: z.string().trim().min(1),
    typ: z.string().optional(),
  })
  .passthrough();

const jwtClaimsSchema = z
  .object({
    aud: z.union([z.string(), z.array(z.string())]),
    email: emailSchema,
    exp: z.number().int(),
    iss: z.string().url(),
    nbf: z.number().int().optional(),
    sub: z.string().optional(),
  })
  .passthrough();

const jwkSchema = z
  .object({
    alg: z.string().optional(),
    e: z.string(),
    kid: z.string().trim().min(1),
    kty: z.literal('RSA'),
    n: z.string(),
    use: z.string().optional(),
  })
  .passthrough();

const jwksSchema = z
  .object({
    keys: z.array(jwkSchema).min(1),
  })
  .passthrough();

interface CachedJwks {
  readonly expiresAt: number;
  readonly keys: readonly AccessJwk[];
}

type AccessJwk = z.infer<typeof jwkSchema>;

export interface AccessJwtDependencies {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const cache = new Map<string, CachedJwks>();
const JWKS_CACHE_MILLISECONDS = 5 * 60 * 1000;
const CLOCK_TOLERANCE_SECONDS = 30;

function unauthenticated(message = 'A valid Cloudflare Access session is required.'): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', message);
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    const decoded = atob(`${normalized}${padding}`);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw unauthenticated();
  }
}

function parseSegment(value: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as unknown;
  } catch {
    throw unauthenticated();
  }
}

function normalizedIssuer(value: string): string {
  return value.replace(/\/$/, '').toLowerCase();
}

async function loadKeys(
  teamDomain: string,
  dependencies: AccessJwtDependencies,
  forceRefresh = false,
): Promise<readonly AccessJwk[]> {
  const now = dependencies.now();
  const cached = cache.get(teamDomain);
  if (!forceRefresh && cached !== undefined && cached.expiresAt > now) {
    return cached.keys;
  }

  let response: Response;
  try {
    response = await dependencies.fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw unauthenticated('The authentication key service is unavailable.');
  }
  if (!response.ok) {
    throw unauthenticated('The authentication key service is unavailable.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw unauthenticated('The authentication key service returned invalid keys.');
  }
  const parsed = jwksSchema.safeParse(body);
  if (!parsed.success) {
    throw unauthenticated('The authentication key service returned invalid keys.');
  }
  const keys = parsed.data.keys;
  cache.set(teamDomain, { expiresAt: now + JWKS_CACHE_MILLISECONDS, keys });
  return keys;
}

async function verificationKey(
  kid: string,
  config: AppConfig,
  dependencies: AccessJwtDependencies,
): Promise<CryptoKey> {
  const teamDomain = config.accessTeamDomain;
  if (teamDomain === undefined) {
    throw unauthenticated();
  }
  let keys = await loadKeys(teamDomain, dependencies);
  let key = keys.find((candidate) => candidate.kid === kid);
  if (key === undefined) {
    keys = await loadKeys(teamDomain, dependencies, true);
    key = keys.find((candidate) => candidate.kid === kid);
  }
  if (key === undefined) {
    throw unauthenticated();
  }

  try {
    const jsonWebKey: JsonWebKey = {
      e: key.e,
      kty: key.kty,
      n: key.n,
      ...(key.alg === undefined ? {} : { alg: key.alg }),
      ...(key.use === undefined ? {} : { use: key.use }),
    };
    return await crypto.subtle.importKey(
      'jwk',
      jsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    throw unauthenticated();
  }
}

export async function verifyAccessJwt(
  token: string,
  config: AppConfig,
  dependencies: AccessJwtDependencies = { fetch, now: () => Date.now() },
): Promise<{ readonly email: string }> {
  const segments = token.split('.');
  const encodedHeader = segments[0];
  const encodedPayload = segments[1];
  const encodedSignature = segments[2];
  if (
    segments.length !== 3 ||
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined
  ) {
    throw unauthenticated();
  }

  const header = jwtHeaderSchema.safeParse(parseSegment(encodedHeader));
  const claims = jwtClaimsSchema.safeParse(parseSegment(encodedPayload));
  if (!header.success || !claims.success) {
    throw unauthenticated();
  }

  const expectedIssuer = `https://${config.accessTeamDomain ?? ''}`;
  if (normalizedIssuer(claims.data.iss) !== normalizedIssuer(expectedIssuer)) {
    throw unauthenticated();
  }
  const audiences = Array.isArray(claims.data.aud) ? claims.data.aud : [claims.data.aud];
  if (config.accessAudience === undefined || !audiences.includes(config.accessAudience)) {
    throw unauthenticated();
  }

  const nowSeconds = Math.floor(dependencies.now() / 1000);
  if (claims.data.exp <= nowSeconds - CLOCK_TOLERANCE_SECONDS) {
    throw unauthenticated('The Cloudflare Access session has expired.');
  }
  if (claims.data.nbf !== undefined && claims.data.nbf > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
    throw unauthenticated();
  }

  const key = await verificationKey(header.data.kid, config, dependencies);
  const signature = new Uint8Array([...decodeBase64Url(encodedSignature)]);
  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) {
    throw unauthenticated();
  }

  return { email: claims.data.email };
}

export function clearAccessJwksCacheForTests(): void {
  cache.clear();
}
