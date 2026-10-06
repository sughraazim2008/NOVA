import { ParsedGoalSchema, type IsoDate, type ParsedGoal, type Result } from "@nova/types";
import { GOAL_PARSER_SYSTEM, GOAL_PARSER_VERSION, goalParserUser } from "./prompts/goal-parser";
import { generateValidated, type AIDeps, type AIError } from "./structured";

/**
 * Turns a sentence into a structured goal. `today` is passed in so that relative dates
 * ("by December") are resolved against a known day, never the machine's clock.
 */
export function parseGoal(input: { text: string; today: IsoDate }, deps: AIDeps): Promise<Result<ParsedGoal, AIError>> {
  return generateValidated(
    {
      task: "goal-parser",
      promptVersion: GOAL_PARSER_VERSION,
      system: GOAL_PARSER_SYSTEM,
      user: goalParserUser(input.text, input.today),
      schema: ParsedGoalSchema,
      semantic: (goal) =>
        goal.deadline && goal.deadline < input.today
          ? [`deadline ${goal.deadline} is before today (${input.today}); resolve it to the next date that has not passed`]
          : [],
    },
    deps,
  );
}
