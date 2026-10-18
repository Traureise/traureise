/** Runs once when the server starts: tells the operator what still needs configuring. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadConfig, startupWarnings } = await import("@/composition/config");
  for (const warning of startupWarnings(loadConfig())) console.warn(`[traureise] WARNING: ${warning}`);
}
