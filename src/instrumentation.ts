/**
 * Runs once when the server starts: tells the operator what still needs configuring and starts the guest
 * jobs. The Node.js-only code lives in its own module, imported only in this branch, so it never ends up
 * in the Edge bundle Next.js also builds from this file.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("./instrumentation-node")).registerNode();
}
