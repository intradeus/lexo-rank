/**
 * Optional hook that fires when a newly-constructed rank exceeds a configured
 * length threshold — signalling that the rank space is getting dense and a
 * rebalance is probably in order.
 *
 * Both fields are optional; monitoring is only active when BOTH are provided.
 *
 * Contract:
 * - The callback is invoked **synchronously** from inside the rank's
 *   constructor, right after all fields are set.
 * - The callback runs once per rank construction that exceeds the threshold
 *   — no deduping. If you want to throttle, do it inside your handler.
 * - Exceptions thrown by the handler propagate to the caller who constructed
 *   the rank. Promise returns are ignored by the library (the handler is
 *   typed as returning `void`). If your handler needs to do async work, do
 *   it fire-and-forget and handle your own errors, e.g.
 *   `void rebalanceQueue.enqueue(rank.bucket).catch(logger.error)`.
 * - The threshold compares against `rank.toString().length`, i.e. the full
 *   rendered rank including any bucket prefix and decimal suffix.
 */
export interface RebalanceMonitor<T> {
  /** Fire `onRebalanceNeeded` when `rank.toString().length` exceeds this. */
  rebalanceThreshold?: number | undefined;
  /** Synchronous callback. See contract in the interface docstring. */
  onRebalanceNeeded?: ((rank: T) => void) | undefined;
}

/**
 * Shared check applied at the tail of every rank constructor. Does nothing
 * unless both `rebalanceThreshold` and `onRebalanceNeeded` are set on the
 * monitor.
 */
export function maybeFireRebalanceMonitor<T extends { toString(): string }>(
  rank: T,
  monitor: RebalanceMonitor<T> | undefined
): void {
  if (!monitor) return;
  const threshold = monitor.rebalanceThreshold;
  const handler = monitor.onRebalanceNeeded;
  if (threshold === undefined || handler === undefined) return;
  if (rank.toString().length > threshold) {
    handler(rank);
  }
}
