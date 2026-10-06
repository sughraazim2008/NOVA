import { CreateUserInputSchema, type CreateUserInput, type IsoDateTime, type User } from "@nova/types";
import type { Db } from "../client";
import { toUser } from "../mappers";

export async function createUser(db: Db, input: CreateUserInput): Promise<User> {
  const data = CreateUserInputSchema.parse(input);
  return toUser(await db.user.create({ data }));
}

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const row = await db.user.findUnique({ where: { id } });
  return row ? toUser(row) : null;
}

export async function getUserByEmail(db: Db, email: string): Promise<User | null> {
  const row = await db.user.findUnique({ where: { email } });
  return row ? toUser(row) : null;
}

export async function touchLastActive(db: Db, userId: string, now: IsoDateTime): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date(now) } });
}

/** Removes the user and, through cascades, everything they own. */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.user.deleteMany({ where: { id: userId } });
}
