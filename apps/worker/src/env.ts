export interface WorkerBindings {
  readonly DB: D1Database;
  readonly ENVIRONMENT: 'development' | 'production' | 'test';
  readonly DEV_AUTH_EMAIL?: string;
  readonly ADMIN_EMAIL?: string;
  readonly APP_ORIGIN?: string;
  readonly ACCESS_TEAM_DOMAIN?: string;
  readonly ACCESS_AUDIENCE?: string;
}

export type WorkerEnvironment = { Bindings: WorkerBindings };
