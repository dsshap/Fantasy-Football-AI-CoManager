export type IntelligenceMode = "full" | "realtime" | "analytics";

export interface DispatchOptions {
  mode: IntelligenceMode;
  forceExecution?: boolean;
  now?: Date;
}

export interface DispatchResult {
  dispatched: boolean;
  mode: IntelligenceMode;
  week: number;
  repository: string;
  workflow: string;
  ref: string;
  status: number;
  dryRun: boolean;
}

const DEFAULT_OWNER = "dsshap";
const DEFAULT_REPO = "Fantasy-Football-AI-CoManager";
const DEFAULT_WORKFLOW = "fantasy-phase4-intelligence.yml";
const DEFAULT_REF = "main";

export function isNFLSeason(date = new Date()): boolean {
  const month = date.getUTCMonth() + 1;
  return month === 1 || (month >= 9 && month <= 12);
}

export function getCurrentNFLWeek(date = new Date()): number {
  const seasonStart = new Date(Date.UTC(date.getUTCFullYear(), 8, 1));
  const weeksSinceStart = Math.floor((date.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function envFlag(name: string): boolean {
  return ["1", "true", "yes", "on"].includes((process.env[name] || "").toLowerCase());
}

export async function dispatchFantasyWorkflow(options: DispatchOptions): Promise<DispatchResult> {
  const now = options.now ?? new Date();
  const owner = process.env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const workflow = process.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW;
  const ref = process.env.GITHUB_WORKFLOW_REF || DEFAULT_REF;
  const repository = `${owner}/${repo}`;
  const week = getCurrentNFLWeek(now);
  const dryRun = envFlag("FANTASY_SCHEDULER_DRY_RUN");

  if (dryRun) {
    console.log(`[dry-run] Would dispatch ${workflow} in ${repository} with mode=${options.mode}, week=${week}`);
    return {
      dispatched: false,
      mode: options.mode,
      week,
      repository,
      workflow,
      ref,
      status: 0,
      dryRun,
    };
  }

  const token = requiredEnv("GITHUB_DISPATCH_TOKEN");
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "fantasy-football-inngest-scheduler",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        intelligence_mode: options.mode,
        week: String(week),
        force_execution: String(Boolean(options.forceExecution)),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub workflow dispatch failed (${response.status} ${response.statusText}): ${body}`);
  }

  return {
    dispatched: true,
    mode: options.mode,
    week,
    repository,
    workflow,
    ref,
    status: response.status,
    dryRun,
  };
}
