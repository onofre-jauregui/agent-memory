/**
 * Multi-tenancy helpers — parameterized over table names so the same patterns
 * work across any schema. The original Supabase implementation hardcoded
 * "trades", "risk_settings", "risk_state"; here, the caller passes them in.
 */

export interface TenantContext {
  /** The resolved user_id, or null for the default/legacy tenant. */
  userId: string | null;
  /** True if the user_id came from a verified JWT. */
  authenticated: boolean;
}

/**
 * A minimal subset of any Supabase-style query builder. Anything that
 * exposes `.eq()`, `.is()`, `.select()`, `.maybeSingle()` works.
 */
export interface QueryBuilder {
  eq(column: string, value: unknown): this;
  is(column: string, value: unknown): this;
  select(cols?: string): this;
  maybeSingle(): Promise<{ data: unknown }>;
}

export interface SupabaseLike {
  from(table: string): QueryBuilder;
  auth?: {
    getUser(jwt: string): Promise<{ data: { user?: { id?: string } | null } | null; error: unknown }>;
  };
}

/**
 * Resolve the tenant from an incoming Request. Order of precedence:
 *  1. Verified JWT in Authorization header
 *  2. Explicit user_id in parsedBody
 *  3. NULL — legacy / default tenant
 */
export async function resolveTenant(
  req: Request,
  supabase: SupabaseLike,
  parsedBody?: { user_id?: string },
  serviceRoleKey?: string
): Promise<TenantContext> {
  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization");

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const jwt = authHeader.slice(7).trim();
    if (jwt && jwt !== serviceRoleKey && supabase.auth?.getUser) {
      try {
        const { data, error } = await supabase.auth.getUser(jwt);
        if (!error && data?.user?.id) {
          return { userId: data.user.id, authenticated: true };
        }
      } catch {
        // fall through
      }
    }
  }

  if (
    parsedBody &&
    typeof parsedBody.user_id === "string" &&
    parsedBody.user_id.length > 0
  ) {
    return { userId: parsedBody.user_id, authenticated: false };
  }

  return { userId: null, authenticated: false };
}

/** Apply a user_id filter to a query builder. */
export function applyTenantFilter<T extends QueryBuilder>(
  query: T,
  userId: string | null
): T {
  if (userId) return query.eq("user_id", userId) as T;
  return query.is("user_id", null) as T;
}

/** Object suitable for spreading into an insert payload. */
export function tenantInsertFields(userId: string | null): {
  user_id: string | null;
} {
  return { user_id: userId };
}

/**
 * Generic loader for a single row scoped to a tenant. Pass the table name —
 * no hardcoding.
 */
export async function loadTenantRow(
  supabase: SupabaseLike,
  table: string,
  userId: string | null,
  extraFilters?: Array<[string, unknown]>
): Promise<unknown | null> {
  let query = supabase.from(table).select("*");
  for (const [col, val] of extraFilters || []) {
    query = query.eq(col, val);
  }
  query = applyTenantFilter(query, userId);
  const { data } = await query.maybeSingle();
  return data || null;
}
