# Orchestrator Benchmark

Benchmark harness for comparing AI Orchestrator vs vanilla Claude CLI performance.

## Purpose

Answers the question: **Does using AI Orchestrator produce better results than using Claude Code natively?**

Specifically tests:
- **Quality**: Does orchestration produce more correct/complete answers?
- **Complexity handling**: Does orchestrator handle multi-file and large-context tasks better?
- **Context resilience**: Does orchestrator's advantage grow as context fills up?

## Quick Start

```bash
cd benchmarks/orchestrator-benchmark

# See what will run without executing
npx ts-node runner.ts --dry-run

# Run full benchmark suite (~180 runs)
npx ts-node runner.ts

# Run a single task
npx ts-node runner.ts --task KA-1
```

## Commands

| Command | Description |
|---------|-------------|
| `npx ts-node runner.ts` | Run full benchmark suite |
| `npx ts-node runner.ts --task <id>` | Run specific task only |
| `npx ts-node runner.ts --dry-run` | Show plan without executing |
| `npx ts-node runner.ts --resume <session>` | Resume interrupted session |
| `npx ts-node runner.ts --report <session>` | Generate report for session |
| `npx ts-node runner.ts --skip-vanilla` | Only run orchestrator tests |
| `npx ts-node runner.ts --skip-orchestrator` | Only run vanilla tests |
| `npx ts-node runner.ts --skip-scoring` | Run tasks but skip scoring/judging |
| `npx ts-node runner.ts --score-only <session>` | Score existing session without re-running |
| `npx ts-node runner.ts --no-isolation` | Disable git worktree isolation between runs |

## Scientific Rigor

### Run Order Randomization
Runs are executed in randomized order to reduce drift bias from:
- API performance variations
- Caching effects
- Time-of-day fluctuations

Use `--dry-run` to preview the randomized execution order.

### Run Isolation
Each run executes in an isolated git worktree to prevent contamination between runs. The worktree is created fresh and deleted after each run.

Disable with `--no-isolation` if worktrees are unavailable (falls back to `git stash`).

## Test Matrix

Each task runs:
- **2 systems**: Vanilla Claude CLI, AI Orchestrator
- **3 runs per config**: For statistical confidence (median used)
- **3 context stages**: Fresh (0%), Moderate (~50k tokens), Heavy (~100k tokens)

**Total runs**: 10 tasks × 2 systems × 3 runs × 3 stages = **180 runs**

## Tasks

### Known-Answer Tasks (Objective Verification)

| ID | Task | Complexity |
|----|------|------------|
| KA-1 | Find all IPC handlers | Multi-file |
| KA-2 | List singleton services | Multi-file |
| KA-3 | Find orchestration-handler imports | Multi-file |
| KA-4 | Find injected bugs | Multi-file |

### Real Codebase Tasks (Judge Evaluation)

| ID | Task | Complexity |
|----|------|------------|
| RC-1 | Explain model routing | Large-context |
| RC-2 | Child crash handling | Multi-file |
| RC-3 | Review fast-path retrieval | Multi-file |
| RC-4 | Adding orchestrator commands | Large-context |
| RC-5 | Instance failure modes | Multi-file |
| RC-6 | Trace message to child spawn | Large-context |

> **Note:** RC-6 was moved from Known-Answer tasks (formerly KA-5) because trace completeness is inherently subjective.

## Directory Structure

```
benchmarks/orchestrator-benchmark/
├── runner.ts              # Main CLI entry point
├── types.ts               # Type definitions
├── task-loader.ts         # Load tasks from JSON
├── context-filler.ts      # Generate context for stages
├── result-storage.ts      # Persist results, generate reports
├── scorer.ts              # Score known-answer tasks against ground truth
├── executors/
│   ├── vanilla-executor.ts      # Run via claude CLI
│   └── orchestrator-executor.ts # Run via Orchestrator app
├── tasks/
│   ├── task-suite.json    # Task definitions
│   └── setup/
│       ├── ground-truth.ts     # Generate ground truth for KA tasks
│       ├── ground-truth.json   # Generated ground truth data
│       ├── inject-bugs.ts      # Inject bugs for KA-4
│       └── remove-bugs.ts      # Remove injected bugs
└── results/               # Output directory (gitignored)
```

## Setup Scripts

Before running benchmarks, generate the ground truth:

```bash
cd benchmarks/orchestrator-benchmark

# Generate ground truth for known-answer tasks
npx ts-node tasks/setup/ground-truth.ts

# For KA-4 (bug finding), inject the test bugs
npx ts-node tasks/setup/inject-bugs.ts

# After benchmarking KA-4, remove the bugs
npx ts-node tasks/setup/remove-bugs.ts

# Check bug injection status
npx ts-node tasks/setup/inject-bugs.ts --status
```

## Results

Results are stored in `results/` as JSON files:
- `benchmark-YYYY-MM-DD-HH-MM-SS.json` - Raw run data
- `benchmark-YYYY-MM-DD-HH-MM-SS-report.json` - Aggregated report

### Sample Report Output

```
ORCHESTRATOR BENCHMARK RESULTS
==============================

Overall: Orchestrator wins 7/10 tasks, ties 2, loses 1

By Complexity:
  Multi-file tasks:    Orchestrator 85.2 vs Vanilla 72.1
  Large-context tasks: Orchestrator 88.5 vs Vanilla 68.3

Context Resilience (heavy/fresh score ratio):
  Vanilla:      68.5%
  Orchestrator: 89.2%

Cost Multiplier: 2.3x
```

## Implementation Status

- [x] **Phase 1**: Core harness (task runner, executors, storage)
- [x] **Phase 2**: Task suite definition
- [x] **Phase 2b**: Ground truth scripts and scorer for known-answer tasks
- [x] **Phase 3**: Judging pipeline (Claude + Codex evaluation)
- [ ] **Phase 4**: Full execution
- [ ] **Phase 5**: Analysis and insights

## Notes

- **API Usage**: Full benchmark uses significant API tokens. Plan to run after weekly usage resets.
- **Orchestrator Mode**: The orchestrator executor expects the Electron app to support a `BENCHMARK_MODE` environment variable (implementation pending).
- **Resume Support**: If interrupted, use `--resume <session-id>` to continue from where you left off.
