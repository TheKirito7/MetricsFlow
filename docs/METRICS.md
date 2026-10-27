# Metric definitions

All persisted prices and transaction amounts are integer **EUR cents**. Recurring calculations use `Decimal`, including fractional cents from yearly normalization. Values are rounded half-up once at the response boundary, never separately per subscription. ARR uses unrounded MRR before rounding; multiplying an already rounded display value can differ by a few cents.

## Reporting interval and snapshot

`start_date` and `end_date` are inclusive organization-local dates. The backend converts `[local midnight at start, local midnight after end)` to UTC with the organization’s IANA timezone. This handles 23-hour and 25-hour daylight-saving days. The period is at most 731 calendar days and cannot end in the future.

`snapshot_at` is the last microsecond of the end date, capped at the current instant for today. The previous snapshot is the last microsecond before the current period starts. Snapshot KPI comparisons therefore compare the start and end of the selected reporting window.

Period totals are sums inside the date interval. The comparison interval contains the same number of local calendar dates immediately before the selected period. Today’s period is still in progress, so a revenue comparison including today is provisional. The UI labels the snapshot separately from the reporting period and shows the reporting timezone.

API business timestamps without a suffix represent UTC. The browser’s shared date helper interprets them explicitly as UTC, then formats in the organization timezone. Analytics `snapshot_at` includes its UTC offset.

## Recurring metrics

A billable subscription at instant `t` has `activated_at <= t`, and either no `ends_at` or `ends_at > t`. The end boundary is exclusive. Trial subscriptions have no activation timestamp and contribute no recurring revenue. Stored current status is not used to erase an earlier active interval. Cancelled and expired subscriptions can therefore contribute to past snapshots.

| Metric                     | Formula                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| Monthly charge             | Monthly snapshot price; or yearly snapshot price ÷ 12                        |
| MRR                        | Sum of normalized monthly charges for billable subscriptions at the snapshot |
| ARR                        | Unrounded MRR × 12                                                           |
| Active subscriptions       | Number of billable subscriptions at the snapshot                             |
| Paying customers           | Distinct customer IDs with at least one billable subscription                |
| ARPU                       | Unrounded MRR ÷ paying customers; zero if there are none                     |
| Snapshot percentage change | `(current - previous) / previous × 100`; undefined when previous is zero     |

An archived customer with an active subscription remains a paying customer. Archival is a CRM operation, not cancellation. Multiple active subscriptions for one customer each contribute MRR, while the customer counts once.

## Churn

Let `S` be customers paying immediately before the start date, and `E` those paying at the end snapshot. Customer churn is `|S minus E| / |S| × 100`, or zero when `S` is empty. Cancelling one subscription does not churn a customer who retains another. A customer who stops and returns before the end remains in `E` and is not counted as lost in this ending-cohort definition. Customers acquired and lost entirely inside the period are outside the starting cohort.

The UI identifies this as loss from the starting cohort. This is customer churn, not subscription churn, gross revenue churn, or net revenue retention.

## Collected payments and growth

- Paid volume sums `amount_cents` for records whose current status is `paid` and timestamp is inside the interval.
- Pending, failed, and refunded rows do not contribute to collected revenue. Ledger summaries report them separately.
- Refunds in the MVP are whole transactions with `refunded` status. There is no partial-refund event model or net cash-flow calculation.
- Revenue growth is `(current paid volume - previous paid volume) / previous paid volume × 100`.
- A zero previous volume produces `null`, displayed as “No previous baseline”; no infinity or invented 100% increase is shown.
- Assigning a subscription updates recurring revenue but creates no payment. Transactions are simulated records created by the development seed or the explicit admin payment action. Recording one payment changes collected totals, not recurring charges.

## Chart semantics

- MRR trend is a series of end-of-bucket snapshots, using each subscription’s historical price and active window.
- Paid transaction trend sums paid rows in each bucket. The bucket sums equal the period paid total.
- Customer growth counts customers created up to each bucket end, including archived records. “New customers” counts creations inside the selected period.
- New subscription counts use `started_at`, including trials. Cancelled counts use the effective `cancelled_at` timestamp. Expirations are not cancellations.
- Plan distribution uses active subscriptions at the snapshot. Revenue by plan attributes paid transactions to the linked subscription’s stable plan ID and saved plan name. Duplicate plan names remain separate. Unlinked payments appear under “Unassigned.”
- Ranges up to 91 inclusive dates use daily buckets; longer ranges use calendar-month buckets with partial first/last buckets when appropriate.
- All reporting results come from tenant-scoped database records. An empty tenant receives zero-valued buckets, no plans, and no revenue-growth baseline.

## Subscription lifecycle

Create as `trial` or `active`. Trial can become active, cancelled, or expired. Active can become cancelled or expired. Cancellation takes effect immediately at the server’s UTC timestamp, which sets both `cancelled_at` and `ends_at`. Expiry also ends the recurring interval immediately. A terminal subscription cannot be reactivated; create a new one. These decisions are audited atomically with the mutation. No future-dated cancellation, scheduled trial expiry, or automated renewal billing runs in this MVP.

Plan updates affect future assignments only. Original subscription price/interval/name snapshots remain unchanged for historical reporting.

## Financial verification

`backend/tests/test_metrics.py` covers normalization, sum-before-rounding, multiple subscriptions per customer, zero denominators, trials, historical cancellations, exclusive boundaries, tenant isolation, failed/refunded exclusions, churn, cohort membership, empty data, customer growth, timezone midnight, and DST. API and browser tests also verify that creating a subscription changes persisted dashboard MRR.

## Comparison availability

`history_start` is the earliest tenant-owned customer, subscription or transaction timestamp. Snapshot comparisons require that history to reach the start snapshot, and are labeled “since period start.” Collected revenue comparisons require history reaching the beginning of the full prior equal-length period; otherwise the percentage is null and the UI says there is insufficient comparison history. This is an availability check, not a claim that historical imports are complete. A zero denominator with sufficient recorded history still has no percentage baseline.
