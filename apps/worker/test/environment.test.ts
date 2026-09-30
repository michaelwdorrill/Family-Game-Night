import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, parseWorkerConfig } from '../src/config/environment';

const db = { prepare: () => undefined } as unknown as D1Database;

describe('Worker environment configuration', () => {
  it('normalizes a complete hosted configuration', () => {
    expect(
      parseWorkerConfig({
        DB: db,
        ENVIRONMENT: 'production',
        ADMIN_EMAIL: 'Admin@Example.com',
        APP_ORIGIN: 'https://games.example.com',
        ACCESS_TEAM_DOMAIN: 'family.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'audience-value',
      }),
    ).toEqual({
      environment: 'production',
      adminEmail: 'admin@example.com',
      appOrigin: 'https://games.example.com',
      accessTeamDomain: 'family.cloudflareaccess.com',
      accessAudience: 'audience-value',
    });
  });

  it('fails closed when development authentication leaks into production', () => {
    expect(() =>
      parseWorkerConfig({
        DB: db,
        ENVIRONMENT: 'production',
        DEV_AUTH_EMAIL: 'developer@example.test',
        ADMIN_EMAIL: 'admin@example.com',
        APP_ORIGIN: 'https://games.example.com',
        ACCESS_TEAM_DOMAIN: 'family.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'audience-value',
      }),
    ).toThrow(EnvironmentConfigurationError);
  });

  it('requires every authentication setting in its applicable environment', () => {
    expect(() =>
      parseWorkerConfig({
        DB: db,
        ENVIRONMENT: 'test',
        ADMIN_EMAIL: 'admin@example.com',
      }),
    ).toThrow('DEV_AUTH_EMAIL');
    expect(() =>
      parseWorkerConfig({
        DB: db,
        ENVIRONMENT: 'staging',
        ADMIN_EMAIL: 'admin@example.com',
        APP_ORIGIN: 'http://games.example.com',
      }),
    ).toThrow('HTTPS');
  });
});
