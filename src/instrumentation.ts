/** Runs once when the server starts: tells the operator what still needs configuring. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadConfig, startupWarnings } = await import("@/composition/config");
  const { FileLegalPages } = await import("@/infrastructure/legal/files");
  const config = loadConfig();
  const unreadable = await new FileLegalPages({ imprint: config.IMPRINT_FILE, privacy: config.PRIVACY_FILE, terms: config.TERMS_FILE }).unreadableSettings();
  const warnings = [...startupWarnings(config), ...(unreadable.length ? [`${unreadable.join(", ")} set but not readable: those pages do not exist.`] : [])];
  for (const warning of warnings) console.warn(`[traureise] WARNING: ${warning}`);
}
