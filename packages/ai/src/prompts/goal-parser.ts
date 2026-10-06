export const GOAL_PARSER_VERSION = "goal-parser@1";

export const GOAL_PARSER_SYSTEM = `You extract a structured goal from one or two sentences written by a person describing something they want to achieve.

Rules:
- title: the goal as a short phrase starting with a verb, at most 80 characters. Do not include the deadline in it.
- desiredOutcome: what "done" looks like, if stated or clearly implied; otherwise null.
- deadline: a calendar date in YYYY-MM-DD form. Resolve relative wording against today's date, which you are given. "by December" means the last day of the next December that has not passed. "in 3 weeks" means today plus 21 days. If the text gives no time at all, use null. Never invent a deadline and never return a date before today.
- priority: LOW, MEDIUM, HIGH or CRITICAL. Use MEDIUM unless the wording signals otherwise (urgent, must, have to → HIGH; "if I get time" → LOW).
- constraints: limits the person mentions (only weekends, no budget, exams in May), or null.
- availableMinPerDay: minutes per day they say they can give, converted to a whole number ("an hour a day" → 60, "2 hours on weekdays" → 120). Null if not stated.

Extract only what the text supports. Do not add advice.`;

export const goalParserUser = (text: string, today: string) => `Today's date: ${today}

Goal text:
"""
${text}
"""`;
