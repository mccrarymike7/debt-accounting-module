import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/** Bump when models/enums change so HMR does not keep a stale PrismaClient. */
const CLIENT_VERSION = 8;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
  prismaClientVersion?: number;
};

function createClient() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://debt:debt@localhost:5432/debt_accounting?schema=public";

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
    });
  globalForPrisma.pgPool = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function clientLooksCurrent(client: PrismaClient) {
  const c = client as {
    monthlyClose?: unknown;
    referenceRate?: unknown;
  };
  return typeof c.monthlyClose !== "undefined" && typeof c.referenceRate !== "undefined";
}

function getClient() {
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaClientVersion === CLIENT_VERSION &&
    clientLooksCurrent(globalForPrisma.prisma)
  ) {
    return globalForPrisma.prisma;
  }
  const client = createClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaClientVersion = CLIENT_VERSION;
  return client;
}

export const prisma = getClient();
