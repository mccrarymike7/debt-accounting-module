/** JSON helpers that convert BigInt (Prisma money fields) to strings. */

export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as T;
}

export function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(
    JSON.stringify(data, (_key, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
  );
}
