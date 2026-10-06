import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/client";

/** A database handle: the client itself, or a transaction opened on it. Every query takes one. */
export type Db = PrismaClient | Prisma.TransactionClient;

export function createDb(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

let shared: PrismaClient | undefined;

/** Process-wide client for the application. Tests create their own with createDb. */
export function getDb(): PrismaClient {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    shared = createDb(url);
  }
  return shared;
}

/** Runs fn in a transaction, joining the caller's transaction when there already is one. */
export function inTransaction<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return "$transaction" in db ? db.$transaction(fn) : fn(db);
}
