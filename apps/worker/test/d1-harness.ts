import { readFile } from 'node:fs/promises';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

interface StatementDescriptor {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface HarnessResult {
  readonly db: D1Database;
  readonly dispose: () => Promise<void>;
}

const databaseWorker = `
export default {
  async fetch(request, env) {
    try {
      const body = await request.json();
      if (body.operation === 'exec') {
        return Response.json(await env.DB.exec(body.sql));
      }
      if (body.operation === 'batch') {
        const statements = body.statements.map((item) =>
          env.DB.prepare(item.sql).bind(...item.values),
        );
        return Response.json(await env.DB.batch(statements));
      }
      const statement = env.DB.prepare(body.sql).bind(...body.values);
      if (body.operation === 'first') {
        return Response.json(await statement.first());
      }
      if (body.operation === 'all') {
        return Response.json(await statement.all());
      }
      if (body.operation === 'run') {
        return Response.json(await statement.run());
      }
      if (body.operation === 'raw') {
        return Response.json(await statement.raw());
      }
      return new Response('Unknown operation.', { status: 400 });
    } catch (error) {
      return Response.json(
        { message: error instanceof Error ? error.message : 'Database operation failed.' },
        { status: 500 },
      );
    }
  },
};
`;

class HttpD1Adapter {
  readonly #descriptors = new WeakMap<object, StatementDescriptor>();
  readonly #miniflare: Miniflare;

  public constructor(miniflare: Miniflare) {
    this.#miniflare = miniflare;
  }

  async #invoke<T>(body: Readonly<Record<string, unknown>>): Promise<T> {
    const response = await this.#miniflare.dispatchFetch('http://database.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof result === 'object' &&
        result !== null &&
        'message' in result &&
        typeof result.message === 'string'
          ? result.message
          : 'The D1 test harness operation failed.';
      throw new Error(message);
    }
    return result as T;
  }

  #statement(sql: string, values: readonly unknown[]): D1PreparedStatement {
    const descriptor = { sql, values };
    const statement = {
      bind: (...nextValues: readonly unknown[]) => this.#statement(sql, nextValues),
      first: <T = unknown>() => this.#invoke<T | null>({ operation: 'first', ...descriptor }),
      all: <T = unknown>() => this.#invoke<D1Result<T>>({ operation: 'all', ...descriptor }),
      run: <T = unknown>() => this.#invoke<D1Result<T>>({ operation: 'run', ...descriptor }),
      raw: <T = unknown[]>() => this.#invoke<T[]>({ operation: 'raw', ...descriptor }),
    };
    this.#descriptors.set(statement, descriptor);
    return statement as unknown as D1PreparedStatement;
  }

  public asDatabase(): D1Database {
    return {
      prepare: (sql: string) => this.#statement(sql, []),
      batch: async <T = unknown>(statements: D1PreparedStatement[]) => {
        const descriptors = statements.map((statement) => {
          const descriptor = this.#descriptors.get(statement);
          if (descriptor === undefined) {
            throw new Error('A statement from another database was passed to batch().');
          }
          return descriptor;
        });
        return this.#invoke<D1Result<T>[]>({
          operation: 'batch',
          statements: descriptors,
        });
      },
      exec: (sql: string) => this.#invoke<D1ExecResult>({ operation: 'exec', sql }),
    } as unknown as D1Database;
  }
}

export async function createD1Harness(): Promise<HarnessResult> {
  const registryPath = `.wrangler/test-${crypto.randomUUID()}/registry`;
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      port: 0,
      modules: true,
      script: databaseWorker,
      d1Databases: { DB: crypto.randomUUID() },
      logRequests: false,
      unsafeDevRegistryPath: registryPath,
    }),
  );
  await miniflare.ready;
  const db = new HttpD1Adapter(miniflare).asDatabase();
  const migrationDirectory = new URL('../../../migrations/', import.meta.url);
  const firstMigration = await readFile(new URL('0001_initial.sql', migrationDirectory), 'utf8');
  const secondMigration = await readFile(
    new URL('0002_profile_confirmation.sql', migrationDirectory),
    'utf8',
  );
  try {
    for (const migration of [firstMigration, secondMigration]) {
      const statements = migration
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
      for (const statement of statements) await db.prepare(statement).run();
    }
  } catch (error) {
    await miniflare.dispose();
    throw error;
  }
  return { db, dispose: () => miniflare.dispose() };
}
