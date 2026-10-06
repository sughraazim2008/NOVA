import * as database from "@nova/database";
import { getDb, inTransaction } from "@nova/database";
import type { CreateTaskInput, Task, TaskDependency, UpdateTaskInput, User } from "@nova/types";
import { onTaskCreated } from "../hooks/behaviour";
import { found, HttpError } from "../http";

export async function createTask(user: User, milestoneId: string, input: CreateTaskInput): Promise<Task> {
  return inTransaction(getDb(), async (tx) => {
    const task = found(await database.createTask(tx, user.id, milestoneId, input));
    await onTaskCreated(tx, user, task);
    return task;
  });
}

export async function getTask(user: User, taskId: string): Promise<Task> {
  return found(await database.getTask(getDb(), user.id, taskId));
}

export async function updateTask(user: User, taskId: string, input: UpdateTaskInput): Promise<Task> {
  return found(await database.updateTask(getDb(), user.id, taskId, input, new Date().toISOString()));
}

export async function deleteTask(user: User, taskId: string): Promise<void> {
  found(await database.deleteTask(getDb(), user.id, taskId));
}

export async function addDependency(user: User, dependency: TaskDependency): Promise<TaskDependency> {
  const result = await database.addDependency(getDb(), user.id, dependency);
  if (result.ok) return result.value;
  switch (result.error) {
    case "TASK_NOT_FOUND":
      throw new HttpError("NOT_FOUND");
    case "SELF_REFERENCE":
      throw new HttpError("VALIDATION_FAILED", "A task cannot depend on itself.");
    case "CYCLE":
      throw new HttpError("CONFLICT", "That would make these tasks wait on each other in a loop.");
  }
}

export async function removeDependency(user: User, dependency: TaskDependency): Promise<void> {
  found(await database.removeDependency(getDb(), user.id, dependency));
}
