-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'DEFERRED', 'DROPPED');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('WRITING', 'READING', 'STUDY', 'PRACTICE', 'CODING', 'RESEARCH', 'ADMIN', 'COMMUNICATION', 'PLANNING', 'OTHER');

-- CreateEnum
CREATE TYPE "EnergyDemand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('USER', 'AI', 'SPLIT', 'BLOCKER');

-- CreateEnum
CREATE TYPE "DailyOutcome" AS ENUM ('PENDING', 'COMPLETED', 'PARTIAL', 'SKIPPED', 'POSTPONED', 'MISSED');

-- CreateEnum
CREATE TYPE "StartSessionOutcome" AS ENUM ('COMPLETED', 'PARTIAL', 'ABANDONED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TASK_CREATED', 'TASK_STARTED', 'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_POSTPONED', 'TASK_ABANDONED', 'FRICTION_REPORTED', 'ESTIMATE_OVERRUN', 'ESTIMATE_UNDERRUN', 'DECOMPOSITION_CONFIRMED', 'REPLAN_APPLIED');

-- CreateEnum
CREATE TYPE "FrictionReason" AS ENUM ('TOO_OVERWHELMING', 'DONT_KNOW_HOW_TO_START', 'LOW_ENERGY', 'DISTRACTED', 'DONT_UNDERSTAND', 'DONT_WANT_TO', 'NOT_ENOUGH_TIME');

-- CreateEnum
CREATE TYPE "ReplanActionType" AS ENUM ('SHRINK', 'SPLIT', 'REWRITE', 'MICRO_ACTIONS', 'RETIME', 'REPRIORITISE', 'DEFER', 'DROP_SUGGESTED');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK');

-- CreateEnum
CREATE TYPE "EstimateDimension" AS ENUM ('CATEGORY', 'SIZE_BUCKET', 'HOUR_BAND');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('FULL', 'QUIET', 'OFF');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultDailyCapacityMin" INTEGER NOT NULL DEFAULT 120,
    "lastActiveAt" TIMESTAMP(3),
    "gameMode" "GameMode" NOT NULL DEFAULT 'FULL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "desiredOutcome" TEXT,
    "deadline" DATE NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dailyCapacityMin" INTEGER NOT NULL,
    "constraints" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "targetDate" DATE,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedMin" INTEGER NOT NULL,
    "actualMin" INTEGER,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "category" "TaskCategory" NOT NULL DEFAULT 'OTHER',
    "energyDemand" "EnergyDemand" NOT NULL DEFAULT 'MEDIUM',
    "deadline" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "deferredUntil" DATE,
    "origin" "TaskOrigin" NOT NULL DEFAULT 'USER',
    "startCount" INTEGER NOT NULL DEFAULT 0,
    "postponeCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "taskId" TEXT NOT NULL,
    "dependsOnTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("taskId","dependsOnTaskId")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "capacityMin" INTEGER NOT NULL,
    "usedMin" INTEGER NOT NULL,
    "plannerVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "plannedMin" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "outcome" "DailyOutcome" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "stuckCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "outcome" "StartSessionOutcome",

    CONSTRAINT "StartSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehaviourEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "goalId" TEXT,
    "type" "EventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "BehaviourEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrictionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reason" "FrictionReason" NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAction" "ReplanActionType",
    "startedAfter" BOOLEAN,

    CONSTRAINT "FrictionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEstimate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dimension" "EstimateDimension" NOT NULL,
    "key" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalProjection" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectedDate" DATE NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "requiredMinPerDay" INTEGER NOT NULL,
    "remainingMin" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "GoalProjection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_goalId_order_key" ON "Milestone"("goalId", "order");

-- CreateIndex
CREATE INDEX "Task_goalId_status_idx" ON "Task"("goalId", "status");

-- CreateIndex
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");

-- CreateIndex
CREATE INDEX "TaskDependency_dependsOnTaskId_idx" ON "TaskDependency"("dependsOnTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_userId_date_key" ON "DailyPlan"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyTask_taskId_idx" ON "DailyTask"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_dailyPlanId_taskId_key" ON "DailyTask"("dailyPlanId", "taskId");

-- CreateIndex
CREATE INDEX "StartSession_userId_startedAt_idx" ON "StartSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "StartSession_taskId_idx" ON "StartSession"("taskId");

-- CreateIndex
CREATE INDEX "BehaviourEvent_userId_occurredAt_idx" ON "BehaviourEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "BehaviourEvent_userId_type_idx" ON "BehaviourEvent"("userId", "type");

-- CreateIndex
CREATE INDEX "BehaviourEvent_taskId_idx" ON "BehaviourEvent"("taskId");

-- CreateIndex
CREATE INDEX "FrictionEvent_userId_occurredAt_idx" ON "FrictionEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "FrictionEvent_taskId_idx" ON "FrictionEvent"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionEstimate_userId_dimension_key_key" ON "ExecutionEstimate"("userId", "dimension", "key");

-- CreateIndex
CREATE INDEX "GoalProjection_goalId_computedAt_idx" ON "GoalProjection"("goalId", "computedAt");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartSession" ADD CONSTRAINT "StartSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartSession" ADD CONSTRAINT "StartSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviourEvent" ADD CONSTRAINT "BehaviourEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviourEvent" ADD CONSTRAINT "BehaviourEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviourEvent" ADD CONSTRAINT "BehaviourEvent_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrictionEvent" ADD CONSTRAINT "FrictionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrictionEvent" ADD CONSTRAINT "FrictionEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEstimate" ADD CONSTRAINT "ExecutionEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalProjection" ADD CONSTRAINT "GoalProjection_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules Prisma's schema language cannot express.
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_no_self_reference" CHECK ("taskId" <> "dependsOnTaskId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_estimatedMin_range" CHECK ("estimatedMin" BETWEEN 1 AND 480);
ALTER TABLE "Task" ADD CONSTRAINT "Task_actualMin_non_negative" CHECK ("actualMin" IS NULL OR "actualMin" >= 0);
ALTER TABLE "Task" ADD CONSTRAINT "Task_counts_non_negative" CHECK ("startCount" >= 0 AND "postponeCount" >= 0);
ALTER TABLE "Task" ADD CONSTRAINT "Task_deferred_has_date" CHECK ("status" <> 'DEFERRED' OR "deferredUntil" IS NOT NULL);
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_dailyCapacityMin_range" CHECK ("dailyCapacityMin" BETWEEN 5 AND 960);
ALTER TABLE "User" ADD CONSTRAINT "User_defaultDailyCapacityMin_range" CHECK ("defaultDailyCapacityMin" BETWEEN 0 AND 960);
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_minutes_valid" CHECK ("capacityMin" >= 0 AND "usedMin" >= 0 AND "usedMin" <= "capacityMin");
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_plannedMin_positive" CHECK ("plannedMin" > 0);
ALTER TABLE "ExecutionEstimate" ADD CONSTRAINT "ExecutionEstimate_ranges" CHECK ("multiplier" > 0 AND "completionRate" BETWEEN 0 AND 1 AND "sampleSize" >= 0);
