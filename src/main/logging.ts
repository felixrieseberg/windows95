export function log(message: string, ...args: unknown[]) {
  console.log(`[${new Date().toLocaleString()}] ${message}`, ...args);
}
