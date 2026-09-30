import type { UserProfileDto } from '@family-game-night/shared';

export interface WorkerBindings {
  readonly DB: D1Database;
  readonly ENVIRONMENT: string;
  readonly DEV_AUTH_EMAIL?: string;
  readonly ADMIN_EMAIL?: string;
  readonly APP_ORIGIN?: string;
  readonly ACCESS_TEAM_DOMAIN?: string;
  readonly ACCESS_AUDIENCE?: string;
}

export interface AppConfig {
  readonly environment: 'development' | 'test' | 'staging' | 'production';
  readonly appOrigin: string;
  readonly adminEmail: string;
  readonly devAuthEmail?: string;
  readonly accessTeamDomain?: string;
  readonly accessAudience?: string;
}

export type WorkerEnvironment = {
  Bindings: WorkerBindings;
  Variables: {
    config: AppConfig;
    requestId: string;
    user: UserProfileDto;
  };
};
