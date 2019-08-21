/**
 * Are we currently running in development mode?
 *
 * @returns {boolean}
 */
export function isDevMode() {
  return !!process.defaultApp;
}
