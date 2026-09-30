import { z } from 'zod';

export const sequenceLobbyStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: z.enum(['lobby', 'cancelled']),
    teamCount: z.union([z.literal(2), z.literal(3)]),
  })
  .strict();

export type SequenceLobbyState = z.infer<typeof sequenceLobbyStateSchema>;

export function parseSequenceLobbyState(input: unknown): SequenceLobbyState {
  return sequenceLobbyStateSchema.parse(input);
}
