# Faultless Performance Benchmarks

Comprehensive benchmark suite for the Faultless microservice framework.

## Quick Start

```bash
# From the Faultless monorepo root
cd benchmarks

# Run all benchmarks
pnpm bench

# Run individual benchmark suites
pnpm bench:http
pnpm bench:core
pnpm bench:middleware
pnpm bench:syncx
pnpm bench:resilience
```

Or run from the monorepo root:

```bash
npx vitest bench --run --config benchmarks/vitest.config.ts benchmarks/syncx.bench.ts
```

## What's Measured

### HTTP Performance (`http.bench.ts`)
- **GET /ping** — minimal JSON response (Faultless vs raw Fastify)
- **GET /json** — larger payload (50 objects)
- **POST /echo** — request body parsing
- **GET /echo?foo=bar** — query string handling
- **Concurrent 10 / 50** — parallel request throughput

### Core Performance (`core.bench.ts`)
- **Decorator reflection** — `defineMetadata`, `getMetadata`, `hasMetadata`
- **Route extraction** — `getRouteMetadata`, `getControllerPrefix`
- **Type checks** — `isController`, `isProvider`, `getInjectableOptions`
- **Error construction** — all error subclasses (NofaultError, ValidationError, etc.)
- **Error type checks** — `isNofaultError`, `isRetryableError`
- **Error serialization** — `toJSON()`

### Middleware Performance (`middleware.bench.ts`)
- **Individual middleware** — cors, helmet, requestId, timeout
- **Middleware pipeline** — cors → helmet → requestId
- **Guards** — createRoleGuard, composeGuards
- **Interceptors** — transform, cache (hit/miss)
- **Pipes** — parseInt, parseArray, composed pipes
- **Filters** — allExceptions, notFound, validation

### Sync Primitives (`syncx.bench.ts`)
- **Once** — first call, already-done skip, isDone
- **Limit** — acquire/release, guard, queue pressure
- **Map** — set/get, load (cached/miss), has/delete/size
- **Atomic** — get/set, add/inc/dec, CAS (success/fail)
- **Channel** — buffered, unbuffered, close

### Resilience Performance (`resilience.bench.ts`)
- **CircuitBreaker** — execute (success/fail), getState, getStats, reset
- **RateLimiter** — consume (single/burst), get, reset
- **CacheManager** — set/get, miss, getOrSet, mset/mget, delete, has, stats
- **Bulkhead** — execute (single/parallel), getState
- **Deadline** — creation, remainingMs, isExpired, toHeaders, fromHeaders, downstream, race
- **TimeoutBudget** — create, getRemainingBudget, isExhausted, cleanup

## Benchmark Results (Apple M-series)

### Sync Primitives — Throughput (ops/sec)

| Operation | ops/sec | p99 (μs) |
|-----------|---------|----------|
| Once.do (async) | 1,839,518 | 0.8 |
| Once.do (sync) | 1,677,424 | 2.7 |
| Once.isDone | 3,481,213 | 0.6 |
| Limit.acquire/release | 2,902,852 | 0.5 |
| Limit.guard (sync fn) | 1,996,649 | 0.7 |
| Map.set+get (string) | 5,786,192 | 0.3 |
| Map.set+get (number) | 5,751,181 | 0.3 |
| Map.load (cached) | 2,677,426 | 0.6 |
| Map.has | 9,328,515 | 0.1 |
| Map.size | 9,447,070 | 0.1 |
| Atomic.get | 7,954,387 | 0.2 |
| Atomic.add(5) | 7,975,331 | 0.2 |
| Atomic.cas (success) | 7,918,907 | 0.2 |
| Channel.buffered send/recv | 2,188,126 | 0.7 |
| Channel.close | 7,805,463 | 0.2 |

### Core — Throughput (ops/sec)

| Operation | ops/sec | p99 (μs) |
|-----------|---------|----------|
| defineMetadata (single) | 4,073,480 | 0.3 |
| defineMetadata (10 keys) | 366,357 | 2.8 |
| getMetadata | 3,433,405 | 0.3 |
| hasMetadata | 4,527,738 | 0.3 |
| getRouteMetadata | 3,226,681 | 0.3 |
| isController | 4,559,496 | 0.3 |
| isProvider | 4,497,606 | 0.3 |
| NofaultError construction | 83,238 | 12.5 |
| isNofaultError (instanceof) | 6,761,571 | 0.2 |
| Error.toJSON | 793,270 | 1.3 |

### Resilience — Throughput (ops/sec)

| Operation | ops/sec | p99 (μs) |
|-----------|---------|----------|
| CircuitBreaker.execute (success) | ~100,000 | ~10 |
| RateLimiter.consume (under limit) | ~200,000 | ~5 |
| CacheManager.set+get | ~300,000 | ~3 |
| CacheManager.getOrSet (miss) | ~200,000 | ~5 |
| Bulkhead.execute | ~200,000 | ~5 |
| Deadline.creation | ~500,000 | ~2 |
| Deadline.remainingMs | ~1,000,000 | ~1 |
| TimeoutBudget.create | ~500,000 | ~2 |

## Reading Results

| Metric     | Meaning                                      |
| ---------- | -------------------------------------------- |
| `hz`       | Operations per second — higher is better      |
| `avg`      | Average time per operation                   |
| `p75`      | 75th percentile                             |
| `p99`      | 99th percentile (tail latency)              |
| `p995`     | 99.5th percentile                           |
| `p999`     | 99.9th percentile                           |
| `rme`      | Relative margin of error                    |
| `samples`  | Number of iterations run                    |

## Comparing Against Baseline

```bash
# Run and save baseline
pnpm bench > bench-baseline.txt

# Make changes, then run again
pnpm bench > bench-current.txt

# Diff
diff bench-baseline.txt bench-current.txt
```

## Notes

- Benchmarks run against **source** (via vitest aliases), not built `dist/`.
- HTTP benchmarks start real servers on random ports — no external dependencies.
- Syncx benchmarks test single-threaded JS performance (no true concurrency).
- Cache benchmarks use in-memory provider only (no Redis overhead).
- Middleware benchmarks include logger noise from `@faultless/log` — this is expected.
