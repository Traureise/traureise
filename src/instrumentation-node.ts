/** Node.js only (see instrumentation.ts): startup warnings and the guest jobs. */
export async function registerNode() {
  const { loadConfig, startupWarnings } = await import("@/composition/config");
  const { FileLegalPages } = await import("@/infrastructure/legal/files");
  const config = loadConfig();
  const unreadable = await new FileLegalPages({ imprint: config.IMPRINT_FILE, privacy: config.PRIVACY_FILE, terms: config.TERMS_FILE }).unreadableSettings();
  const warnings = [...startupWarnings(config), ...(unreadable.length ? [`${unreadable.join(", ")} set but not readable: those pages do not exist.`] : [])];
  for (const warning of warnings) console.warn(`[traureise] WARNING: ${warning}`);
  if (config.GUEST_JOBS_INTERVAL_MINUTES > 0) startGuestJobs(config.GUEST_JOBS_INTERVAL_MINUTES * 60_000);
}

/**
 * Retention and daily summaries, without a separate scheduler: a timer in every instance. The job is
 * idempotent and claims each email in the database, so several instances can run it side by side.
 */
function startGuestJobs(intervalMs: number) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { container } = await import("@/composition/container");
      const result = await container().runGuestJobs.execute();
      if (result.deleted.length) console.info(`[traureise] deleted the guest data of ${result.deleted.length} website(s) at the end of their package`);
    } catch (error) {
      console.error("[traureise] guest jobs failed", error);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, intervalMs).unref();
}
