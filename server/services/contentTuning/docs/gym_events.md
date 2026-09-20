Generate a fun gym event for tomorrow that fits this gym's current state.
Choose a type: competition, class, delivery, special_guest, or maintenance.
Include an NPC host npcKey if relevant (use one of: trainer_marcus, receptionist_lisa, regular_derek, regular_priya, regular_tom, regular_elena, specialist_coach, specialist_nutritionist), or null.
Keep it short and exciting. activeHours should be a two-element array like [7, 9] (start hour, end hour, 24h format).
effects can include allNpcMoodBonus (integer) and/or xpMultiplier (float).
Return JSON only matching this structure:
{
  "type": "competition",
  "title": "Morning Power Hour",
  "description": "Marcus is running a group training session at 7am. Join in?",
  "npcKey": "trainer_marcus",
  "activeHours": [7, 9],
  "effects": { "allNpcMoodBonus": 20, "xpMultiplier": 1.5 }
}
