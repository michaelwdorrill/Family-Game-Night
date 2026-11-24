export const linkStorage = 'family-game-night.link';
export const nameStorage = 'family-game-night.player';

export function rememberFamilyLink() {
  const [path, search] = location.hash.split('?');
  const key = new URLSearchParams(search).get('family');
  if (key) {
    localStorage.setItem(linkStorage, key);
    history.replaceState(null, '', location.pathname + location.search + (path || '#/'));
    return true;
  }
  return false;
}
export class FamilyError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly alternatives?: string[][],
  ) {
    super(message);
  }
}
export async function familyRequest<T>(
  path: string,
  name?: string,
  body?: unknown,
  creationId?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'X-Family-Link': localStorage.getItem(linkStorage) ?? '',
  };
  if (creationId) headers['Idempotency-Key'] = creationId;
  if (name) headers['X-Family-Player'] = name;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/family/' + path, {
    headers,
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const value = (await response.json()) as {
      error: { message: string; code: string; details?: { alternatives?: string[][] } };
    };
    throw new FamilyError(value.error.message, value.error.code, value.error.details?.alternatives);
  }
  return (await response.json()) as T;
}
