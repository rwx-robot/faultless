# Changelog

All notable changes to the Faultless framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [13.0.0] - 2026-12-31

### Added

- `@faultless/auth` — Authentication & Authorization module
  - JWT-based authentication with access and refresh token support
  - Role-Based Access Control (RBAC) with granular permission policies
  - OAuth 2.0 / OIDC provider integration
  - Session management with token rotation and revocation
  - Middleware for route-level auth enforcement
  - API Key authentication for machine-to-machine communication
  - Rate limiting per authenticated user
  - Audit logging for security events
  - Compliance checks for GDPR and SOC2

### Changed

- Improved TypeScript type definitions across all packages
- Enhanced error handling with more specific error types
- Updated documentation with comprehensive examples
- Performance optimizations for high-throughput scenarios

### Fixed

- Memory leak in long-running services with authentication
- Token refresh race conditions
- Permission caching invalidation issues

## [12.0.0] - 2026-01-15

### Added

- `@faultless/auth` — Initial authentication module
  - JWT token generation and validation
  - Role-based access control
  - OAuth 2.0 integration
  - Session management

### Changed

- Migrated from nofault to faultless namespace
- Updated all package.json files with new repository URLs
- Standardized error codes across all modules

## [11.0.0] - 2025-06-01

### Added

- `@faultless/governance` — Microservice governance module
  - Circuit breaker with configurable failure thresholds and half-open recovery
  - Rate limiting via token bucket and sliding window algorithms
  - Bulkhead isolation for downstream dependency protection
  - Distributed tracing propagation across service boundaries
  - Centralized configuration hot-reload via watch mechanism
  - Health check registry with liveness and readiness probes
  - Service mesh integration (Istio, Linkerd)
  - Traffic management and canary deployments

- `@faultless/cli` — Code generation CLI tool
  - Scaffold new services, APIs, and models from templates
  - Generate boilerplate for handlers, routes, and middleware
  - Swagger/OpenAPI spec generation from route definitions
  - Project structure validation and linting
  - Custom template support for organization-specific patterns
  - Migration tool for database schema changes
  - Deployment configuration generator

### Changed

- Improved CLI output formatting and colors
- Enhanced template engine with conditional logic
- Updated documentation generation with mermaid diagrams

### Fixed

- CLI installation issues on Windows
- Template variable escaping in generated code
- Migration rollback script generation

## [10.0.0] - 2024-03-15

### Added

- `@faultless/gateway` — API Gateway module
  - Unified entry point for upstream service routing
  - Request/response transformation and field mapping
  - Rate limiting and throttling per upstream client
  - Authentication token forwarding and validation
  - Load balancing across gateway backend instances
  - Graceful degradation and fallback routing
  - WebSocket support for real-time applications
  - CORS configuration with preflight handling

### Changed

- Enhanced HTTP module with streaming support
- Improved middleware composition with priority ordering
- Updated health check endpoints with detailed status

### Fixed

- Connection pooling exhaustion under high load
- WebSocket message framing issues
- CORS preflight caching problems

## [9.0.0] - 2023-09-01

### Added

- `@faultless/tracing` — Distributed tracing module
  - OpenTelemetry SDK integration with trace context propagation
  - Auto-instrumentation for HTTP, gRPC, and database calls
  - Export to Jaeger, Zipkin, and OTLP-compatible backends
  - Span annotation and baggage item support
  - Sampling strategies (head-based, tail-based)
  - Trace context injection/extract

- `@faultless/metrics` — Metrics collection module
  - Prometheus exporter with pre-defined histograms and counters
  - Custom metric registration (Counter, Gauge, Histogram, Summary)
  - Runtime metrics: goroutines, GC pauses, memory allocation
  - HTTP request duration and status code distribution tracking
  - Business metrics (order count, revenue, conversion rate)

### Changed

- Improved performance logging with structured output
- Enhanced error tracking with stack traces
- Updated monitoring dashboards with Grafana templates

### Fixed

- Memory usage in high-cardinality metric scenarios
- Trace context propagation across async boundaries
- Metric aggregation for distributed counters

## [8.0.0] - 2022-06-01

### Added

- `@faultless/rpc` — RPC framework module
  - Protobuf-based message serialization and deserialization
  - gRPC server and client with interceptors
  - HTTP-to-gRPC transcoding support
  - Streaming RPC (client, server, and bidirectional)
  - Load balancing and service discovery integration for RPC endpoints
  - Connection pooling with health checks
  - TLS/mTLS support for secure communication

### Changed

- Enhanced HTTP module with gRPC gateway support
- Improved error handling with gRPC status codes
- Updated documentation with gRPC examples

### Fixed

- Connection timeout handling in gRPC clients
- Stream cleanup on client disconnect
- Load balancer endpoint refresh race conditions

## [7.0.0] - 2021-03-01

### Added

- `@faultless/cache` — Caching module
  - In-memory, Redis, and multi-tier cache backends
  - Cache-aside and write-through strategies
  - TTL and eviction policy configuration (LRU, LFU)
  - Cache key generation with prefix and tag support
  - Distributed cache invalidation via pub/sub
  - Cache warming and preloading
  - Cache statistics and hit rate monitoring

- `@faultless/store` — Data store abstraction module
  - Unified interface for SQL, NoSQL, and file-based storage
  - Connection pooling with health checks and automatic reconnection
  - Transaction support with savepoint and rollback
  - Soft delete and timestamp-based optimistic locking
  - Query builder with type-safe conditions
  - Migration support for schema changes

### Changed

- Improved cache performance with batch operations
- Enhanced store query optimization
- Updated documentation with ORM examples

### Fixed

- Cache stampede prevention issues
- Store connection pool exhaustion
- Transaction isolation level consistency

## [6.0.0] - 2020-06-01

### Added

- `@faultless/bloom` — Bloom filter module
  - Space-efficient probabilistic data structure
  - Configurable false positive rate
  - Memory-optimized with multiple hash functions

- `@faultless/circuit-breaker` — Circuit breaker module
  - State machine implementation (Closed, Open, Half-Open)
  - Configurable failure thresholds
  - Automatic recovery with exponential backoff

- `@faultless/collection` — Collection utilities
  - Thread-safe data structures
  - Generic collection operations
  - Priority queues and deques

- `@faultless/concurrency` — Concurrency primitives
  - Mutex and read-write locks
  - Semaphore for resource limiting
  - Once and atomic operations
  - Concurrent map and counter

- `@faultless/event` — Event system
  - Publish-subscribe messaging
  - Event sourcing support
  - Ordered event processing

- `@faultless/fx` — Functional programming
  - Pipe and flow composition
  - Curry and partial application
  - Memoize and debounce utilities

- `@faultless/mr` — MapReduce operations
  - Parallel map and reduce
  - Pipeline composition
  - Waterfall execution

- `@faultless/stream` — Stream processing
  - Reactive streams with backpressure
  - Windowing and batching
  - Transformation pipelines

- `@faultless/worker` — Worker pool
  - Task queue with priority
  - Worker lifecycle management
  - Graceful shutdown

### Changed

- Improved performance with optimized data structures
- Enhanced type safety with generics
- Updated documentation with usage examples

### Fixed

- Memory leaks in long-running stream processing
- Race conditions in concurrent collections
- Worker pool exhaustion handling

## [5.0.0] - 2019-06-01

### Added

- `@faultless/resilience` — Advanced resilience patterns module
  - Retry with exponential backoff, jitter, and max-attempts
  - Timeout enforcement with context cancellation propagation
  - Fallback chain with pluggable fallback handlers
  - Hedged requests for latency-sensitive paths
  - Composite resilience wrappers for stacking policies
  - Circuit breaker integration
  - Bulkhead isolation

- `@faultless/retry` — Retry utilities
  - Configurable retry strategies
  - Exponential backoff with jitter
  - Retryable error classification
  - Maximum attempt limits

- `@faultless/breaker` — Circuit breaker module
  - Closed/Open/Half-Open state machine with configurable thresholds
  - Success-rate based and consecutive-failure based trip policies
  - Per-service and per-endpoint breaker isolation
  - Metrics collection for monitoring

### Changed

- Improved retry logic with adaptive backoff
- Enhanced circuit breaker with sliding window statistics
- Updated resilience patterns with bulkhead support

### Fixed

- Retry exhaustion handling
- Circuit breaker state transition race conditions
- Timeout propagation in nested calls

## [4.0.0] - 2018-06-01

### Added

- `@faultless/queue` — Message queue module
  - Unified producer/consumer interface
  - Support for Kafka, RabbitMQ, NATS
  - Dead-letter queue handling
  - Message serialization/deserialization
  - Consumer group management

- `@faultless/limit` — Rate limiting module
  - Token bucket algorithm
  - Sliding window counter
  - Distributed rate limiting with Redis
  - Per-route and per-client limits
  - Custom limit key generation

- `@faultless/store` — Data store module
  - SQL database support (MySQL, PostgreSQL)
  - NoSQL database support (MongoDB, Redis)
  - Connection pooling
  - Query building
  - Migration support

- `@faultless/metrics` — Metrics collection module
  - Prometheus integration
  - Custom metrics registration
  - Runtime metrics collection
  - HTTP request metrics

### Changed

- Improved queue reliability with acknowledgment
- Enhanced rate limiting accuracy
- Updated store with connection health checks
- Enhanced metrics with histogram support

### Fixed

- Queue message ordering issues
- Rate limiter memory usage
- Store connection pool exhaustion
- Metrics aggregation accuracy

## [3.0.0] - 2017-06-01

### Added

- `@faultless/http` — HTTP server module
  - Route registration with method, path, and middleware chain
  - Handler binding with automatic parameter parsing
  - Request/response middleware pipeline
  - Built-in middleware: logging, recovery, CORS, timeout
  - Graceful server shutdown with connection drain
  - Health check endpoints
  - Request validation
  - Response transformation

- `@faultless/validation` — Request validation module
  - Declarative struct/tag validation
  - Custom validator registration
  - Built-in validators for common patterns
  - i18n-friendly error messages

### Changed

- Improved HTTP performance with connection pooling
- Enhanced validation with custom error messages
- Updated middleware composition

### Fixed

- HTTP connection handling under high load
- Validation error message formatting
- Middleware execution order

## [2.0.0] - 2016-06-01

### Added

- `@faultless/config` — Configuration management module
  - YAML/JSON/TOML configuration file loading
  - Environment variable and command-line flag override
  - Struct mapping with `mapstructure` tag support
  - Hot-reload via file system watcher or remote config center
  - Configuration encryption/decryption
  - Remote configuration support
  - Configuration versioning

- `@faultless/log` — Structured logging module
  - Leveled logging (Debug, Info, Warn, Error, Fatal)
  - JSON and console output formatters
  - Context-aware fields propagation
  - Log rotation and output redirection
  - Structured logging with key-value pairs
  - Log sampling for high-volume logs

### Changed

- Improved config loading performance
- Enhanced log formatting
- Updated documentation with examples

### Fixed

- Config file parsing edge cases
- Log level filtering
- Context propagation in async operations

## [1.0.0] - 2015-06-01

### Added

- `@faultless/core` — Core framework library
  - Application lifecycle management (start, graceful shutdown)
  - Dependency injection container with constructor injection
  - Hook registration for pre/post startup and shutdown
  - Signal handling for SIGINT/SIGTERM graceful termination
  - Decorator-based metadata
  - Service container with automatic resolution
  - Error hierarchy with specific error types
  - Utility functions (sleep, retry, deep merge, etc.)

### Changed

- Initial release with core functionality
- Established coding standards and architecture
- Set up CI/CD pipeline

### Fixed

- Initial bug fixes and stability improvements

[13.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v13.0.0
[12.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v12.0.0
[11.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v11.0.0
[10.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v10.0.0
[9.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v9.0.0
[8.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v8.0.0
[7.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v7.0.0
[6.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v6.0.0
[5.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v5.0.0
[4.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v4.0.0
[3.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v3.0.0
[2.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v2.0.0
[1.0.0]: https://github.com/webfault-lib/faultless/releases/tag/v1.0.0
