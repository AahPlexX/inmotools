import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "energy-macro-planner",
  category: "everyday",
  aliases: ["#/energy-macro-planner"],
  shortTitle: "Energy & Macro Planner",
  title: "Energy Expenditure & Macronutrient Planner — Local BMR, TDEE, and Macro Split Workbench",
  audience: "General health · fitness · nutrition planning",
  summary: "Turn body measurements and an activity level into resting energy, expenditure, a goal or timeline calorie target, and protein, fat, and carbohydrate grams. Protein can be set per kilogram. Fiber, water, and body mass index stay on the same page.",
  privacy: "Body measurements, goals, and every calculation stay in this browser. The arithmetic is plain algebra with no lookup service, account, or upload.",
  accepts: "Body mass, stature, age, formula variant, activity level, and an optional body fat percentage",
  outputs: "Basal metabolic rate from each applicable equation, daily energy expenditure, a goal-adjusted target, and macronutrient grams with Markdown, CSV, or JSON export",
  steps: [
    "Enter your measurements and choose an activity level.",
    "Pick a percent tier, a target weight timeline, or a fixed calorie number, then a macro split or protein grams per kilogram.",
    "Review the target, fiber and water references, compare every goal tier, then copy or download the plan.",
  ],
  hint: "These are planning estimates from published equations (Mifflin-St Jeor, revised Harris-Benedict, and Katch-McArdle when body fat is supplied), not clinical guidance or a prescription. Predicted and measured metabolic rate differ between individuals, so treat the output as a starting point and consult a qualified professional before acting on a deficit or surplus.",
  load: () => import('./NutritionWorkspace'),
} satisfies ToolMeta;
