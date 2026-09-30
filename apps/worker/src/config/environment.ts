import { z } from 'zod';

import { emailSchema } from '@family-game-night/shared';

import type { AppConfig, WorkerBindings } from '../env';

const environmentNameSchema = z.enum(['development', 'test', 'staging', 'production']);
const originSchema = z
  .string()
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
      context.addIssue({ code: 'custom', message: 'APP_ORIGIN cannot contain a path or query.' });
      return z.NEVER;
    }
    return url.origin;
  });
const teamDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/);

export class EnvironmentConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'EnvironmentConfigurationError';
  }
}

function requiredString(value: string | undefined, name: string): string {
  const parsed = z.string().trim().min(1).safeParse(value);
  if (!parsed.success) {
    throw new EnvironmentConfigurationError(`${name} must be configured.`);
  }
  return parsed.data;
}

export function parseWorkerConfig(bindings: WorkerBindings): AppConfig {
  const environmentResult = environmentNameSchema.safeParse(bindings.ENVIRONMENT);
  if (!environmentResult.success) {
    throw new EnvironmentConfigurationError(
      'ENVIRONMENT must be development, test, staging, or production.',
    );
  }
  if (bindings.DB === undefined || typeof bindings.DB.prepare !== 'function') {
    throw new EnvironmentConfigurationError('The DB binding must be configured.');
  }

  const environment = environmentResult.data;
  const isHosted = environment === 'staging' || environment === 'production';
  if (isHosted && bindings.DEV_AUTH_EMAIL !== undefined) {
    throw new EnvironmentConfigurationError(
      'DEV_AUTH_EMAIL must never be configured in a hosted environment.',
    );
  }

  const appOriginResult = originSchema.safeParse(
    bindings.APP_ORIGIN ?? (isHosted ? undefined : 'http://127.0.0.1:5173'),
  );
  if (!appOriginResult.success) {
    throw new EnvironmentConfigurationError('APP_ORIGIN must be a valid origin without a path.');
  }
  if (isHosted && !appOriginResult.data.startsWith('https://')) {
    throw new EnvironmentConfigurationError('Hosted APP_ORIGIN must use HTTPS.');
  }

  const adminResult = emailSchema.safeParse(bindings.ADMIN_EMAIL);
  if (!adminResult.success) {
    throw new EnvironmentConfigurationError('ADMIN_EMAIL must be a valid email address.');
  }

  if (!isHosted) {
    const devEmailResult = emailSchema.safeParse(bindings.DEV_AUTH_EMAIL);
    if (!devEmailResult.success) {
      throw new EnvironmentConfigurationError(
        'DEV_AUTH_EMAIL must be a valid email in development and test.',
      );
    }
    return {
      environment,
      appOrigin: appOriginResult.data,
      adminEmail: adminResult.data,
      devAuthEmail: devEmailResult.data,
    };
  }

  const teamDomainResult = teamDomainSchema.safeParse(bindings.ACCESS_TEAM_DOMAIN);
  if (!teamDomainResult.success) {
    throw new EnvironmentConfigurationError(
      'ACCESS_TEAM_DOMAIN must be a Cloudflare Access team hostname.',
    );
  }

  return {
    environment,
    appOrigin: appOriginResult.data,
    adminEmail: adminResult.data,
    accessTeamDomain: teamDomainResult.data,
    accessAudience: requiredString(bindings.ACCESS_AUDIENCE, 'ACCESS_AUDIENCE'),
  };
}
