---
tool: energy-macro-planner
folder: src/tools/nutrition
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-energy-macro-planner-design.md
tracker: src/tools/nutrition/TRACKER.md
updated: 2026-10-05
---

# Energy & Macro Planner — spec

As built at `origin/main` `a582f5dc`. Requirement prefix: `EMP`. Status of each requirement: [TRACKER.md](../../../src/tools/nutrition/TRACKER.md). History: [2026-09-03-energy-macro-planner-design.md](2026-09-03-energy-macro-planner-design.md) (design, reference values and the 2026-10-01 audit addendum), plan [2026-09-03-energy-macro-planner.md](../plans/2026-09-03-energy-macro-planner.md), [README.md](../../../src/tools/nutrition/README.md).

## Purpose

Turn body measurements and an activity level into resting energy, daily expenditure, a goal or timeline calorie target and protein, fat and carbohydrate grams, with fiber, water and body mass index references, for adults planning their own nutrition. A planning calculator; not clinical guidance.

## Scope

In scope:
- Resting energy from Mifflin-St Jeor, revised Harris-Benedict and Katch-McArdle; five activity tiers; percent-tier, timeline and fixed-calorie targets.
- Macros from percent presets, a custom split, or protein per kilogram plus a fat share.
- Advisories, body mass index band, fiber and water references, a comparison of every goal tier.
- Named input presets, autosave and reset; Markdown, CSV and JSON export.

Out of scope:
- Diagnosis, prescription or clinical guidance; children, pregnancy and breastfeeding (ages outside 19–78).

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and data stays in this browser; network use only for the site's own files and public keyless sources requested by the user ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Reference values and sources are in the 2026-09-03 design (Mifflin-St Jeor 1990, Roza–Shizgal 1984, Atwater factors, IOM ranges, EFSA 2010). The constants, the storage keys `inmotools_energy_planner_autosave` and `inmotools_energy_planner_presets_v1`, the slug `energy-macro-planner` and the folder `src/tools/nutrition/` are not changed.
- The tool's copy must not imply clinical advice.

## Architecture and engine

- Engines and libraries: the energy, macro and advisory calculations are first-party TypeScript in `nutrition-engine.ts`; no third-party package is used.
- Storage: localStorage key `inmotools_energy_planner_autosave` holds the autosaved form; key `inmotools_energy_planner_presets_v1` holds the saved presets.
- Browser APIs: Clipboard (`navigator.clipboard.writeText`) copies the plan as Markdown, and a message says access was refused when the clipboard is blocked; Markdown, CSV and JSON exports download through `src/lib/download`.

## Requirements

### Measurements and inputs

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R01 | Body mass, stature and age are entered in the Measurements section; an unsupported or empty value blocks the results and names the field with its bounds, and the invalid field is marked `aria-invalid` | Enter age 18; the results are replaced by a message naming 19–78 |
| EMP-R02 | Ages 19 to 78 are supported, the range of the Mifflin-St Jeor derivation sample, and a scope notice says the tool is for adults who are not pregnant or breastfeeding | Age 18 and age 79 are refused; the scope notice is visible |
| EMP-R03 | A combination of measurements that would give a non-positive resting-energy estimate is refused instead of showing negative calories | Enter 1 kg and 1 cm at age 78; the results are blocked with a message |
| EMP-R04 | The formula variant (male or female constants) is chosen from a list labelled as not a gender field | Switch to female; the resting-energy estimate changes by the female constants |
| EMP-R05 | Metric and Imperial unit buttons switch the fields between kg and cm and lb and ft/in while the stored measurement stays canonical and is not rounded by toggling | Enter 80 kg, switch to Imperial and back; the value is still 80 |
| EMP-R06 | Body fat percentage is optional (1–70%); turning it off while Katch-McArdle is selected switches back to Mifflin-St Jeor and says so | Tick body fat, select Katch-McArdle, untick body fat; Mifflin-St Jeor is selected and the note explains |
| EMP-R07 | Target body mass for the timeline goal is entered in kilograms or in pounds when Imperial units are on | Switch to Imperial; the target mass field is in lb |

### Resting energy and expenditure

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R08 | Resting energy is calculated with Mifflin-St Jeor and with the revised Harris-Benedict equation and both are shown | Enter 80 kg, 180 cm, 30 years, male; Mifflin-St Jeor reads 1,780 kcal |
| EMP-R09 | Katch-McArdle (370 + 21.6 × lean mass) is added from the body fat percentage; without body fat the panel reads Add body fat | Enter 20% body fat at 80 kg; Katch-McArdle reads 1,752 kcal and lean mass 64 kg |
| EMP-R10 | The primary equation is chosen explicitly: Mifflin-St Jeor by default even when body fat is given, Katch-McArdle or revised Harris-Benedict only when selected, and Katch-McArdle is disabled until body fat is supplied | Supply body fat; the primary stays Mifflin-St Jeor until Katch-McArdle is picked |
| EMP-R11 | Five activity levels (×1.2, ×1.375, ×1.55, ×1.725, ×1.9) give total daily energy expenditure, with the multiplier shown as a planning assumption and a disclosure that explains it | Choose Very active; the assumption line reads ×1.725 and the expenditure is the resting estimate × 1.725 |
| EMP-R12 | A worked-equation disclosure shows the selected equation filled in with the user's own numbers | Open Equation with your numbers; it starts with 10×80 for the default male input |
| EMP-R13 | Help disclosures on the activity level, the equations and the goal modes open by tap or keyboard | Open each disclosure with the keyboard; its text shows |

### Goals and energy target

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R14 | A goal tier sets the target as a percent of expenditure: maintenance 0%, mild deficit −10%, moderate deficit −20%, mild surplus +10%, moderate surplus +20% | Choose Mild deficit; the target is 90% of expenditure |
| EMP-R15 | A target body mass over a number of weeks (1–104) solves the daily intake with the 7,700 kcal/kg heuristic and shows the estimated weekly change | 80 kg to 76 kg in 10 weeks gives expenditure − 440 kcal |
| EMP-R16 | A fixed kilocalorie target is used as entered and still builds the macros | Choose Fixed calorie target, enter 2200; the target reads 2,200 |
| EMP-R17 | All five goal tiers are compared at once in a table with adjustment, target and weekly change, with the active tier marked; the comparison stays on percent tiers when the active goal is a timeline | Open Every goal tier; five rows; the chosen tier is highlighted |
| EMP-R18 | Estimated weekly mass change is shown in kilograms, and also in pounds when Imperial units are selected | A 20% deficit shows a negative kg change; in Imperial a lb figure follows |
| EMP-R19 | Meals per day (1–12) divides the day's energy and grams per meal, and the last meal takes any rounding remainder | Set 4 meals; per-meal kcal is a quarter of the target |
| EMP-R20 | The target is shown in kilocalories and kilojoules (4.184 kJ/kcal) | The headline shows kcal and the kJ equivalent |

### Macronutrients

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R21 | Macros are set by a distribution preset — balanced (25/30/45), high protein (35/25/40), low carbohydrate (30/45/25) — as percent of energy, converted with 4, 9 and 4 kcal/g | Choose Balanced; grams sum closely to the target |
| EMP-R22 | A custom split is entered as three percentages that must total 100%; a bad total shows an error and blocks the results | Set protein 50 with fat 30, carbohydrate 40; an error says the total must be 100 |
| EMP-R23 | Protein can be set in grams per kilogram with a fat share, carbohydrate taking the remainder; if protein and fat exceed the target, carbohydrate is held at 0, fat is reduced and a caution is recorded | Set 1.6 g/kg and 25% fat at 80 kg; protein reads 128 g |
| EMP-R24 | Each macronutrient shows grams, kcal, percent of energy and whether it is inside or outside its published range (carbohydrate 45–65%, fat 20–35%, protein 10–35%) | Choose Low carbohydrate; carbohydrate shows Outside |
| EMP-R25 | Protein is shown in grams per kilogram against the 0.8 g/kg adequacy reference, and the calories implied by the rounded grams are reconciled against the target | Rounded grams differ from the target by a few kcal and the difference is shown |
| EMP-R26 | The macro table sits in a labelled, keyboard-reachable scroll region and gives per-meal grams | Tab to the Daily macronutrient targets region on a 320 px screen and scroll it |

### Advisories and references

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R27 | A target below the selected resting estimate or below the 1200 kcal (female) and 1500 kcal (male) planning floors raises an advisory that calls the floor a planning reference, not a clinical minimum, while the numbers are still shown | A 45 kg woman at a moderate deficit sees the advisory and a positive target |
| EMP-R28 | A weekly mass change above 1% of body mass raises an advisory | 80 kg to 70 kg in 4 weeks shows the rate advisory |
| EMP-R29 | Body mass index is shown with its WHO screening band, labelled as a screening index | 80 kg at 180 cm reads 24.7 and normal |
| EMP-R30 | A fiber target of 14 g per 1,000 kcal of the planned intake is shown | At 2,500 kcal the fiber target reads 35 g |
| EMP-R31 | The EFSA total-water adequate intake is shown: 2,000 ml for the female and 2,500 ml for the male formula | The male default reads 2,500 ml |
| EMP-R32 | Advisories appear in a list in the results and in the exports, with a severity and a scope | Trigger the low-intake advisory; it is listed and appears in the CSV |
| EMP-R33 | The results region announces updates politely to screen readers | Change a value with a screen reader on; the new target is announced |

### Presets, autosave and reset

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R34 | The inputs autosave in this browser after every change and are restored on reload | Change the weight, wait, reload; the weight is restored |
| EMP-R35 | Up to 12 named input presets can be saved, updated, loaded and deleted; they keep the canonical kg/cm values and persist across reloads | Save Cut block, reload, load it, delete it |
| EMP-R36 | A preset is refused with a message when it has no name or the current input has errors | Save with an empty name; the note asks for a name |
| EMP-R37 | Reset returns every field to the defaults and clears the autosave while keeping named presets | Press Reset; the weight returns to 80 and presets remain |

### Export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R38 | Copy Markdown places the plan as Markdown on the clipboard and says when the clipboard refuses | Press Copy Markdown; the note says the plan was copied |
| EMP-R39 | Download Markdown saves energy-plan.md with the original inputs and units, canonical units, equation, assumptions, outputs and the not-clinical-guidance statement | Download Markdown; the file lists Stature: 180 cm and the assumptions |
| EMP-R40 | Download CSV saves energy-plan.csv with reconstructable inputs, the primary equation, assumptions, every macronutrient and the advisories | Download CSV; it holds input_weight,93,kg and primary_equation |
| EMP-R41 | Download JSON saves energy-plan.json with the full plan, inputs, assumptions and advisories | Download JSON; it parses and holds input and advisories |
| EMP-R42 | Exports include meals per day, per-meal energy, goal mode, macro mode, body mass index, fiber target, water adequate intake and the worked equation | Download CSV in timeline mode; it holds input_goal_mode,timeline |

### Page, privacy and non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EMP-R43 | The catalog link, the `#/energy-macro-planner` alias and the generic tool route open the same workspace, and a local-privacy status is shown | Open each address; the planner shows |
| EMP-R44 | The measurements, goals and every calculation stay in this browser; no network request carries them | Use the planner with the network blocked; it works |
| EMP-R45 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With the theme set to Dark, the axe color-contrast rule reports nothing in the workspace |
| EMP-R46 | Layout has no horizontal overflow, text collisions or clipped containers from 320 to 2560 px, with 44 px tap targets | Resize from 320 to 2560 px; nothing overlaps or scrolls sideways |
| EMP-R47 | No serious or critical axe violations in the workspace | Run axe on the tool route |

## Non-functional requirements

Responsive layout, theme, accessibility and privacy are the rows under the last requirements subheading above.

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None. No requirement compares a machine-learning and a non-ML method.

## Intent not recorded

None.

## Change log

- 2026-10-05: Created: 47 requirements as built at `a582f5dc`.
