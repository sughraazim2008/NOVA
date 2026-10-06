// @nova/database — Prisma client and typed queries. The only package that touches the database.
// Every query takes a database handle and the acting user's id, and returns domain types from @nova/types.
export { createDb, getDb, inTransaction, type Db } from "./client";
export * from "./queries/users";
export * from "./queries/goals";
export * from "./queries/milestones";
export * from "./queries/tasks";
export * from "./queries/dependencies";
export * from "./queries/plans";
export * from "./queries/events";
