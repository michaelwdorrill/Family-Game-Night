import type { DirectoryUserDto, UserProfileDto, UserRole } from '@family-game-night/shared';

interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly role: UserRole;
  readonly display_name_confirmed: number;
}

function toProfile(row: UserRow): UserProfileDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    needsDisplayNameConfirmation: row.display_name_confirmed !== 1,
  };
}

export function defaultDisplayName(email: string): string {
  const prefix = email.split('@')[0] ?? 'Family Player';
  const words = prefix
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  const candidate = words.join(' ').slice(0, 50).trim();
  return candidate.length > 0 ? candidate : 'Family Player';
}

export async function provisionUser(input: {
  readonly db: D1Database;
  readonly email: string;
  readonly adminEmail: string;
  readonly now: string;
  readonly createId: () => string;
}): Promise<UserProfileDto> {
  const role: UserRole = input.email === input.adminEmail ? 'admin' : 'member';
  await input.db
    .prepare(
      `INSERT INTO users (
        id, email, display_name, role, created_at, updated_at, last_seen_at,
        display_name_confirmed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(email) DO NOTHING`,
    )
    .bind(
      input.createId(),
      input.email,
      defaultDisplayName(input.email),
      role,
      input.now,
      input.now,
      input.now,
    )
    .run();

  await input.db
    .prepare(
      `UPDATE users
       SET last_seen_at = ?, updated_at = ?,
           role = CASE WHEN email = ? COLLATE NOCASE THEN 'admin' ELSE role END
       WHERE email = ? COLLATE NOCASE`,
    )
    .bind(input.now, input.now, input.adminEmail, input.email)
    .run();

  const row = await input.db
    .prepare(
      `SELECT id, email, display_name, role, display_name_confirmed
       FROM users WHERE email = ? COLLATE NOCASE`,
    )
    .bind(input.email)
    .first<UserRow>();
  if (row === null) {
    throw new Error('User provisioning completed without a readable user row.');
  }
  return toProfile(row);
}

export async function updateUserProfile(input: {
  readonly db: D1Database;
  readonly userId: string;
  readonly displayName: string;
  readonly now: string;
}): Promise<UserProfileDto> {
  await input.db
    .prepare(
      `UPDATE users
       SET display_name = ?, display_name_confirmed = 1, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.displayName, input.now, input.userId)
    .run();
  const row = await input.db
    .prepare(
      `SELECT id, email, display_name, role, display_name_confirmed
       FROM users WHERE id = ?`,
    )
    .bind(input.userId)
    .first<UserRow>();
  if (row === null) {
    throw new Error('The authenticated user disappeared during a profile update.');
  }
  return toProfile(row);
}

export async function listDirectoryUsers(
  db: D1Database,
  viewerRole: UserRole,
): Promise<readonly DirectoryUserDto[]> {
  const result = await db
    .prepare(
      `SELECT id, display_name, email
       FROM users
       ORDER BY display_name COLLATE NOCASE, id
       LIMIT 200`,
    )
    .all<{ readonly id: string; readonly display_name: string; readonly email: string }>();
  return result.results.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    ...(viewerRole === 'admin' ? { email: row.email } : {}),
  }));
}
