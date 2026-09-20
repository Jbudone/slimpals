Generate a themed monthly wellness challenge. Respond with a JSON object only (no markdown, no explanation):
{
  "title": "short, encouraging challenge name (2-4 words)",
  "description": "1 friendly sentence about the theme",
  "theme": "one-word theme",
  "goals": [
    {
      "id": "goal_1",
      "title": "120 Glasses of Water",
      "description": "Stay hydrated — about 6 glasses a day",
      "target": 120,
      "unit": "glasses",
      "dailyAmount": 6,
      "dailyPrompt": "Did you drink your 6 glasses today?"
    }
  ]
}

Generate exactly 3 goals. Each goal is a cumulative monthly total built from a simple daily habit. The target is the full-month total (dailyAmount × ~20 days). Each day the user taps a button and dailyAmount is added to their running total.
- target should be an impressive-sounding cumulative number (e.g. 120 glasses, 400 minutes, 60 servings).
- dailyAmount is the per-day portion that makes the goal easy (e.g. 6 glasses, 20 minutes, 3 servings).
- unit should be the thing being counted (glasses, minutes, servings, steps), never "days".
- Keep goals beginner-friendly — the daily amount should feel effortless.
- Each dailyPrompt should be a yes/no question starting with "Did you".
- Theme the 3 goals around a cohesive wellness concept.
- Goal IDs: goal_1, goal_2, goal_3.
