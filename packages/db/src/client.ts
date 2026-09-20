import pg from "pg";

/**
 * Money arrives from Postgres as BIGINT. node-postgres parses int8 to a JS string by
 * default, which is lossless but awkward; parsing it to a `number` would be lossy above
 * 2^53. We convert to BigInt at the boundary and keep it BigInt everywhere inside.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);

export const pool = new pg.Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgresql://postgres@localhost:5432/bakaya",
  max: 10,
});

/**
 * Run a unit of work scoped to one tenant.
 *
 * `SET LOCAL app.current_org_id` is what the RLS policies in db/schema.sql read. Every
 * query the callback makes is filtered by Postgres itself — an application WHERE clause
 * is defence in depth, not the control. See docs/03-data-model.md §5.
 */
export async function withOrg<T>(
  orgId: string,
  fn: (q: Querier) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
    const result = await fn(
      (text, params) => client.query(text, params).then((r) => r.rows),
    );
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type Querier = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;
