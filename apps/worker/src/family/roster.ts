import { z } from 'zod';
import { ApiError } from '../errors';

const familyRoster = z
  .array(
    z
      .string()
      .min(1)
      .max(50)
      .refine((name) => name === name.trim()),
  )
  .min(1)
  .refine((names) => new Set(names).size === names.length);

export function readFamilyRoster(value: string | undefined): string[] {
  const unavailable = () =>
    new ApiError(500, 'FAMILY_UNAVAILABLE', 'Family tables are not configured.');
  let input: unknown;
  try {
    input = value === undefined ? undefined : JSON.parse(value);
  } catch {
    throw unavailable();
  }
  const roster = familyRoster.safeParse(input);
  if (!roster.success) throw unavailable();
  return roster.data;
}
