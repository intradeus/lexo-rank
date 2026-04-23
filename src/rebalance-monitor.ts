import { DEFAULT_REBALANCE_MAX_THRESHOLD } from "./helpers";

/**
 * Optional hook that fires when a newly-constructed rank exceeds a length
 * threshold — signalling that the rank space is getting dense and a
 * rebalance is probably in order.
 *
 * Monitoring is active whenever `onRebalanceNeeded` is set. If
 * `rebalanceThreshold` is omitted, the library default
 * (`DEFAULT_REBALANCE_MAX_THRESHOLD`, currently 30) is used — so wiring up
 * just a callback is enough to start getting useful signal.
 *
 */
export interface RebalanceMonitor<T> {
  /**
   * Fire `onRebalanceNeeded` when `rank.toString().length` exceeds this.
   * Also used by `analyze` as the default `maxThreshold` when computing
   * `recommendRebalance`, so a single config value drives both signals.
   */
  rebalanceThreshold?: number | undefined;
  /**
   * Consulted only by `analyze`: recommend a rebalance when the **average**
   * rank length exceeds this. Under random inserts the avg grows roughly
   * log(n) of the per-rank max, so the two thresholds deliberately aren't
   * the same number. The per-rank monitor callback does NOT use this field
   * — it's an analysis-time control, not a fire-time one.
   */
  rebalanceAvgThreshold?: number | undefined;
  /**
   * Synchronous callback to help with rebalance, based on rebalanceThreshold.
   * Will not fire if not assigned.
   *
   * - The callback runs once per rank construction that exceeds the threshold.
   *   If you want to throttle, do it inside your handler.
   * - Exceptions thrown by the handler propagate to the caller who constructed
   *   the rank. Promise returns are ignored by the library (the handler is
   *   typed as returning `void`). If your handler needs to do async work, do
   *   it fire-and-forget and handle your own errors, e.g.
   *   `void rebalanceQueue.enqueue(rank.bucket).catch(logger.error)`.
   * - The threshold compares against `rank.toString().length`, i.e. the full
   *   rendered rank including any bucket prefix and decimal suffix.
   *
   * @example
   * ```ts
   * const R = createLexoRank({
   *   bucket: true,
   *   rebalanceThreshold: 30,
   *   onRebalanceNeeded: (rank) => {
   *     // Fire-and-forget enqueue; debounce inside the queue if you don't
   *     // want a job per triggering insert.
   *     void rebalanceQueue.enqueue(rank.bucket).catch(logger.error);
   *   }
   * });
   * ```
   */
  onRebalanceNeeded?: ((rank: T) => void) | undefined;
}

/**
 * Shared check fired by `between` / `genNext` / `genPrev` after constructing
 * a derived rank. Active whenever `onRebalanceNeeded` is set; the threshold
 * falls back to the library default when `rebalanceThreshold` is omitted.
 */
export function maybeFireRebalanceMonitor<T extends { toString(): string }>(
  rank: T,
  monitor: RebalanceMonitor<T> | undefined
): void {
  if (!monitor) return;
  const handler = monitor.onRebalanceNeeded;
  if (handler === undefined) return;
  const threshold = monitor.rebalanceThreshold ?? DEFAULT_REBALANCE_MAX_THRESHOLD;
  if (rank.toString().length > threshold) {
    handler(rank);
  }
}
