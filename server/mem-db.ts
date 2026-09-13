/**
 * In-memory auth tables for the no-database dev mode.
 *
 * better-auth's memory adapter and our MemStorage must see the SAME
 * user rows (a session's user id has to resolve through IStorage), so
 * both read from this one object. Keys are better-auth model names.
 * Lives in its own module to avoid an import cycle between auth.ts and
 * storage.ts. Data dies with the process — that is the point of dev mode.
 */

export const memDb: Record<string, any[]> = {
  user: [],
  session: [],
  account: [],
  verification: [],
};
