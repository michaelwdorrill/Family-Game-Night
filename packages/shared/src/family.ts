import { z } from 'zod';

export const familyGames = {
  euchre: { title: 'Euchre', counts: [4] },
  phase: { title: 'Phase Rummy', counts: [2, 3, 4, 5, 6] },
  lantern: { title: 'Lantern Rummy', counts: [2, 3, 4] },
  lines: { title: 'Card Lines', counts: [2, 3, 4, 6, 8, 9, 10, 12] },
} as const;
export const gameKeys = ['euchre', 'phase', 'lantern', 'lines'] as const;
export type FamilyGame = (typeof gameKeys)[number];

export const tableSettings = z
  .object({
    game: z.enum(gameKeys),
    capacity: z.number().int(),
    title: z.string().trim().min(1).max(60).optional(),
    teams: z.union([z.literal(2), z.literal(3)]).optional(),
    timerDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
    visibility: z.enum(['open', 'invite']),
    startMode: z.enum(['auto', 'host']),
    invitees: z.array(z.string().max(50)).max(27),
  })
  .strict();
export type TableSettings = z.infer<typeof tableSettings>;

export interface FamilyTable extends Omit<TableSettings, 'invitees'> {
  id: string;
  version: number;
  host: string;
  players: string[];
  invited: boolean;
  status: 'lobby' | 'active' | 'finished';
  turn: string | null;
  due: number | null;
  summary: string;
  lastTimeout: string | null;
}

export interface MoveChoice {
  label: string;
  handCard?: string;
  cell?: number;
}
export interface FamilyPlay {
  hand: string[];
  details: string[];
  moves: MoveChoice[];
  board?: { code: string; team: number | null; protected: boolean; lastMove: boolean }[];
}
export interface FamilyTableDetail extends FamilyTable {
  play: FamilyPlay | null;
  pending: string[];
}

export const familyAction = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['join', 'decline', 'start']), version: z.number().int().positive() }),
  z.object({
    type: z.enum(['invite', 'partner']),
    name: z.string(),
    version: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('move'),
    index: z.number().int().nonnegative(),
    selection: z.array(z.string()).max(2).optional(),
    version: z.number().int().positive(),
  }),
]);
export type FamilyAction = z.infer<typeof familyAction>;
