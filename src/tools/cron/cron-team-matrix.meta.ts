import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "cron-team-matrix",
  category: "developer",
  shortTitle: "Cron Team Matrix",
  title: "Multi-Timezone Cron Schedule & Global Team Matrix Visualizer",
  audience: "DevOps engineers · system administrators · distributed teams",
  summary: "Resolve upcoming cron runs in the source timezone and compare each instant across global team timezones.",
  privacy: "Cron parsing and timezone projection use local JavaScript libraries and browser Intl APIs.",
  accepts: "Cron expression, source timezone, and comparison timezones",
  outputs: "Upcoming run table and 24-hour distribution matrix",
  steps: [
    "Enter the cron expression and source timezone.",
    "Select the team timezones that matter.",
    "Review upcoming runs before scheduling maintenance or deploys.",
  ],
  hint: "Timezone projections account for DST through the parser and Intl APIs; still verify policy-sensitive maintenance windows with the target system.",
  load: () => import('./CronWorkspace'),
} satisfies ToolMeta;
