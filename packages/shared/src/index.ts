import { z } from 'zod';

export const healthResponseSchema = z
  .object({
    ok: z.literal(true),
    service: z.literal('family-game-night-api'),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: Readonly<Record<string, unknown>>;
  };
}
