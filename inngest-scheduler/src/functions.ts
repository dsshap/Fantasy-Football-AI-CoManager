import { inngest } from "./client.js";
import { dispatchFantasyWorkflow, isNFLSeason, type IntelligenceMode } from "./github.js";

function shouldRunInSeason(date = new Date()): { shouldRun: boolean; reason?: string } {
  if (process.env.DISABLE_NFL_SEASON_GATE === "true") {
    return { shouldRun: true };
  }

  if (!isNFLSeason(date)) {
    return { shouldRun: false, reason: "Outside NFL automation season (September-January)" };
  }

  return { shouldRun: true };
}

function createDispatchFunction({
  id,
  name,
  cron,
  mode,
}: {
  id: string;
  name: string;
  cron: string;
  mode: IntelligenceMode;
}) {
  return inngest.createFunction(
    { id, name },
    { cron },
    async ({ step }) => {
      const gate = shouldRunInSeason();
      if (!gate.shouldRun) {
        return { skipped: true, reason: gate.reason, mode };
      }

      return await step.run(`Dispatch ${mode} GitHub workflow`, async () => {
        return await dispatchFantasyWorkflow({ mode });
      });
    }
  );
}

export const dailyFullAnalysis = createDispatchFunction({
  id: "daily-full-fantasy-analysis",
  name: "Daily full fantasy analysis",
  // 13:17 UTC = ~9:17 AM EDT / 8:17 AM EST.
  cron: "17 13 * * *",
  mode: "full",
});

export const gameDayRealtimeMonitoring = createDispatchFunction({
  id: "game-day-realtime-fantasy-monitoring",
  name: "Game-day realtime fantasy monitoring",
  // Every 4 hours on Sunday, Monday, and Thursday, offset from top-of-hour congestion.
  cron: "23 0,4,8,12,16,20 * * 0,1,4",
  mode: "realtime",
});

export const tuesdayWaiverAnalytics = createDispatchFunction({
  id: "tuesday-waiver-analytics",
  name: "Tuesday waiver analytics",
  // 14:29 UTC = ~10:29 AM EDT / 9:29 AM EST.
  cron: "29 14 * * 2",
  mode: "analytics",
});

export const functions = [
  dailyFullAnalysis,
  gameDayRealtimeMonitoring,
  tuesdayWaiverAnalytics,
];
