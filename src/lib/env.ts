import "server-only";

/**
 * Server-side environment configuration, read once at module load (AR-CONFIG).
 * FAL_KEY must never reach the client (AD-4); the "server-only" import makes
 * any client-side import a build-time error.
 */
export const serverEnv = {
  falKey: process.env.FAL_KEY ?? "",
} as const;
