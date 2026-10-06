// Runs one sentence through the decomposition pipeline and prints the draft.
//   pnpm ai:demo "I want to get a software engineering internship by December."
// Uses the model configured in .env, or the pre-written samples when none is configured.
import { createLLMClientFromEnv, decomposeGoalText, sampleDraft, type AICallLog } from "@nova/ai";
import type { GoalDraft } from "@nova/types";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  console.error('Usage: pnpm ai:demo "<a sentence describing a goal>"');
  process.exit(1);
}

const context = { today: new Date().toISOString().slice(0, 10), defaultDailyCapacityMin: 60 };
const llm = createLLMClientFromEnv(process.env);

function print(draft: GoalDraft) {
  const { goal } = draft;
  console.log(`\n${goal.title}`);
  console.log(`  due ${goal.deadline} · ${goal.dailyCapacityMin} min/day · ${goal.priority}`);
  for (const note of draft.notes) console.log(`  note: ${note}`);
  for (const [index, milestone] of draft.milestones.entries()) {
    console.log(`\n${index + 1}. ${milestone.title}${milestone.targetDate ? `  (by ${milestone.targetDate})` : ""}`);
    for (const task of draft.tasks.filter((t) => t.milestoneKey === milestone.key)) {
      const after = task.dependsOn.length ? `  ← after ${task.dependsOn.join(", ")}` : "";
      console.log(`   [${task.key}] ${task.title} · ${task.estimatedMin} min · ${task.category}${after}`);
      const check = task.realityCheck;
      if (check && check.verdict !== "PASS") console.log(`        ${check.verdict}${check.original ? ` from "${check.original}"` : ""}: ${check.reason}`);
    }
  }
  const total = draft.tasks.reduce((sum, t) => sum + t.estimatedMin, 0);
  console.log(`\n${draft.tasks.length} tasks, ${Math.round(total / 6) / 10} hours\n`);
}

if (!llm) {
  const sample = sampleDraft({ text }, context);
  if (!sample) {
    console.error("No model is configured (see LLM_* in .env.example), and this is not one of the sample sentences.");
    process.exit(1);
  }
  print(sample);
} else {
  const calls: AICallLog[] = [];
  const result = await decomposeGoalText({ text }, context, { llm, log: (entry) => calls.push(entry) });
  for (const call of calls) console.error(`  ${call.task}: ${call.outcome} in ${call.latencyMs} ms, ${call.attempts} attempt(s)`);
  if (!result.ok) {
    console.error("Failed:", JSON.stringify(result.error, null, 2));
    process.exit(1);
  }
  print(result.value);
}
