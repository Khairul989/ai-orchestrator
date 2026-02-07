# Benchmark Report: AI Orchestrator vs Vanilla Claude CLI

**Date:** February 7, 2026
**Harness:** `benchmarks/orchestrator-benchmark/`
**Protocol:** 18 runs per task (2 systems x 3 context stages x 3 runs)
**Context stages:** fresh (0-5k tokens), moderate (~50k tokens), heavy (~100k tokens)

---

## Executive Summary

| Task | Category | Winner | Vanilla Avg | Orchestrator Avg | Cost Ratio | Status |
|------|----------|--------|-------------|------------------|------------|--------|
| NIAH-1 | Retrieval | Tie | 100% | 100% | ~1.0x | Complete |
| NIAH-5 | Retrieval | Tie | 100% | 100% | 0.91x | Complete |
| NIAH-10 | Retrieval | Tie | 83.3% | 83.3% | 1.34x | Complete |
| KA-1 | Known Answer | **Orchestrator** | 22.2% | 35.6% | 2.20x | Complete (high variance) |
| KA-2 | Known Answer | **Vanilla** | 99.1% | 93.5% | 1.52x | Complete |
| KA-3 | Known Answer | Tie | 100% | 100% | 0.52x | Complete |
| KA-4 | Known Answer | Tie | 100% | 96.3% | 1.25x | Complete (terminal only) |
| RC-1 | Real Codebase | N/A | 0% | 0% | 1.03x | **Judge failed** |
| RC-2 | Real Codebase | N/A | 0% | 0% | -- | **Judge failed** |
| RC-3 | Real Codebase | N/A | 0% | 0% | 1.35x | **Judge failed** |
| RC-4 | Real Codebase | N/A | 0% | 0% | -- | **Judge failed** |
| RC-5 | Real Codebase | N/A | 0% | 0% | -- | **Judge failed** |
| RC-6 | Real Codebase | N/A | 0% | 0% | -- | **Judge failed** |

**Overall (scored tasks only):** 1 Orchestrator win, 1 Vanilla win, 5 Ties
**All RC tasks need re-scoring** with API keys configured.

---

## Detailed Results by Category

### NIAH (Needle in a Haystack) -- Deterministic Scoring

All NIAH tasks use deterministic fact-checking (no LLM judge needed).

**NIAH-1** (single needle, shallow depth): Both systems 100% across all runs. Too easy.

**NIAH-5** (3 needles, multiple depths): Both systems 100% across all runs. Still too easy.

**NIAH-10** (Gauntlet -- 6 targets + 4 decoys, consensus protocol theme):
- Both systems: 83.3% average
- Both missed the same needle (`consensus-quorum`) due to a **scorer bug**: generic required fact "5" matched wrong needles via `checkNeedleRetrieval()` line 316
- NIAH-6 through NIAH-9 have **NOT been run yet**

**Session IDs for reference:**
- NIAH-1: `benchmark-2026-02-07-01-44-11`, `benchmark-2026-02-07-01-44-17`
- NIAH-5: `benchmark-2026-02-07-02-02-41`
- NIAH-10: `benchmark-2026-02-07-02-29-24`

---

### KA (Known Answer) -- Deterministic Scoring

**KA-1: List All IPC Handlers** (ground truth: 15 handlers across 3 files)
- Session: `benchmark-2026-02-07-10-52-33`
- **Orchestrator wins: 35.6% vs 22.2%** -- but both are LOW and HIGH VARIANCE

Per-run breakdown (from terminal output):
| Config | Run 1 | Run 2 | Run 3 |
|--------|-------|-------|-------|
| vanilla/fresh | 100% | 0% | 0% |
| vanilla/moderate | 0% | 100% | SKIP |
| vanilla/heavy | 0% | 100% | 66.7% |
| orch/fresh | 0% | 93.3% | 66.7% |
| orch/moderate | 0% | 100% | 33.3% |
| orch/heavy | 0% | 6.7% | 6.7% |

**Key issue:** Many 0% runs on both sides. Likely **output capture failures** in the headless driver -- the CLI process may produce output that is not properly collected, especially under heavy context where the response is large.

---

**KA-2: List All Singletons** (ground truth: 36 singletons)
- Session: `benchmark-2026-02-07-10-52-36`
- **Vanilla wins: 99.1% vs 93.5%**

Per-run breakdown (from report JSON):
| Config | Correctness |
|--------|-------------|
| vanilla/fresh | 100%, 97.2%, 100% |
| vanilla/moderate | 100%, 100% |
| vanilla/heavy | 100%, 100%, 100% |
| orch/fresh | 91.7%, 72.2% |
| orch/moderate | 94.4%, 94.4% |
| orch/heavy | 94.4% |

Vanilla achieves near-perfect scores. Orchestrator misses a few singletons consistently (likely edge cases in the codebase).

---

**KA-3: Files Importing orchestration-handler** (ground truth: 1 file)
- Session: `benchmark-2026-02-07-10-42-00`
- **Tie: 100% both sides**
- Cost ratio: 0.52x -- orchestrator is **cheaper** (209-792 tokens vs 585-1266 tokens for vanilla)
- Simple task, both systems handle it perfectly

---

**KA-4: Find Injected Bugs** (ground truth: 3 bugs in source files)
- Session: `benchmark-2026-02-07-11-36-31` (shared with RC-4)
- **Tie: Vanilla 100% vs Orchestrator 96.3%**
- Scores from **terminal output only** -- JSON file has mixed KA-4/RC-4 data

Per-run breakdown (from terminal):
| Config | Run 1 | Run 2 | Run 3 |
|--------|-------|-------|-------|
| vanilla/fresh | 100% | 100% | 100% |
| vanilla/moderate | 100% | 100% | 100% |
| vanilla/heavy | 100% | 100% | 100% |
| orch/fresh | 100% | 100% | 66.7% |
| orch/moderate | 100% | 100% | 100% |
| orch/heavy | 100% | 100% | 100% |

One orchestrator fresh/run3 scored 66.7% (missed 1 of 3 bugs). Otherwise both near-perfect.

**Note:** Bug injection/removal had issues:
- BUG-003 reported "Already injected" during setup and "Not injected" during teardown
- After remove-bugs.ts, BUG-001 and BUG-002 confirmed clean, BUG-003 status in `model-router.ts` unclear
- **Action needed:** Verify `src/main/routing/model-router.ts` is clean

---

### RC (Real Codebase) -- LLM Judge Scoring (ALL FAILED)

All 6 RC tasks completed their runs (CLI output collected) but **scoring failed**:
```
"Claude API key not configured"
"Codex/OpenAI API key not configured"
```

The judge pipeline requires:
1. `ANTHROPIC_API_KEY` -- for Claude-based judging
2. `OPENAI_API_KEY` -- for Codex/OpenAI dual judging

**Session IDs for re-scoring:**
| Task | Session ID | Runs |
|------|-----------|------|
| RC-1 | `benchmark-2026-02-07-11-15-31` | 18 |
| RC-2 | `benchmark-2026-02-07-11-15-32` | 18 |
| RC-3 | `benchmark-2026-02-07-10-42-01` | 18 |
| RC-4 | `benchmark-2026-02-07-11-36-31` | 18 (shared with KA-4) |
| RC-5 | `benchmark-2026-02-07-11-36-32` | 18 |
| RC-6 | `benchmark-2026-02-07-11-36-34` | 18 |

**Re-score command** (once API keys are set):
```bash
cd benchmarks/orchestrator-benchmark
ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... npx tsx runner.ts --score-only --report <session-id>
```

---

## Known Issues and Action Items

### P0 -- Blocking Issues

1. **RC Judge API Keys Missing**
   - All 6 RC tasks scored 0% because judge API keys are not configured
   - Fix: Set `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` env vars, then re-score with `--score-only --report`
   - Impact: 108 runs (6 tasks x 18) have output but no scores

2. **KA-1 Output Capture Failures**
   - Many runs on both systems scored 0% (no output captured)
   - Root cause: Likely the headless driver (`orchestrator-driver.ts` / `vanilla-driver.ts`) fails to collect CLI stdout under certain conditions
   - Impact: KA-1 results are unreliable -- the 35.6% vs 22.2% gap may be noise

### P1 -- Accuracy Issues

3. **NIAH-10 Scorer False Negative**
   - `checkNeedleRetrieval()` in `scorer.ts:316` skips required facts not found in needle content
   - Generic number "5" matches wrong needles, so `consensus-quorum` needle is never properly scored
   - Fix: Change NIAH-10 requiredFacts from `"5"` to `"quorum of 5"` or `"5 out of 9"`
   - Already partially fixed by linter (removed "5" and "9" from requiredFacts)

4. **KA-4 Scores Not Persisted to JSON**
   - Terminal showed proper scores, but `benchmark-2026-02-07-11-36-31-report.json` has mixed KA-4/RC-4 data
   - The shared session (KA-4 + RC-4 launched together) may have caused data interleaving
   - Fix: Re-run KA-4 in its own session, or parse terminal output for scores

5. **BUG-003 Cleanup Uncertain**
   - `inject-bugs.ts` said "Already injected", `remove-bugs.ts` said "Not injected"
   - Need to verify `src/main/routing/model-router.ts` does not have residual bug markers
   - Fix: `grep -r 'BUG-003' src/` to confirm clean state

### P2 -- Missing Coverage

6. **NIAH-6 through NIAH-9 Not Run**
   - Tasks are defined in `task-suite.json` but have not been run
   - These cover: deep burial, many needles, semantic distraction, multi-hop reasoning
   - Impact: Missing data points for harder retrieval challenges

7. **Runner Does Not Handle Setup/Teardown Scripts**
   - KA-4 `inject-bugs.ts`/`remove-bugs.ts` must be run manually
   - Runner has `setupScript`/`teardownScript` fields in task definition but does not run them
   - Impact: KA-4 requires manual intervention for each run

### P3 -- Non-Blocking Noise

8. **ENOENT Log File Errors**
   - Orchestrator driver logs `ENOENT` for `app.log` and `conversation-history/*.json.gz`
   - Non-blocking: `LogManager` and `HistoryManager` fail gracefully
   - Fix: Create missing directories in `electron-shim.cjs` or suppress errors

9. **Runner Only Supports Single --task Flag**
   - `parseArgs` overwrites with last value; cannot batch multiple tasks
   - Workaround: Run each task as separate background process

---

## Cost Analysis

| Task | Vanilla Tokens (avg) | Orchestrator Tokens (avg) | Cost Ratio |
|------|---------------------|--------------------------|------------|
| NIAH-5 | -- | -- | 0.91x |
| NIAH-10 | -- | -- | 1.34x |
| KA-1 | ~1,600 | ~3,500 | 2.20x |
| KA-2 | ~1,700 | ~2,600 | 1.52x |
| KA-3 | ~750 | ~440 | **0.52x** |
| KA-4 | -- | -- | 1.25x |
| RC-1 | -- | -- | 1.03x |
| RC-3 | -- | -- | 1.35x |

**Observation:** The orchestrator is cheaper on trivial tasks (KA-3: 0.52x) where it can answer quickly without spawning many agents, but 1.25x-2.20x more expensive on complex tasks where it spawns multiple verification/debate agents.

---

## Next Steps (Priority Order)

1. **Configure judge API keys** and re-score all 6 RC tasks (`--score-only --report`)
2. **Investigate KA-1 output capture** -- add logging to headless drivers to diagnose 0% runs
3. **Verify BUG-003 cleanup** in model-router.ts
4. **Run NIAH-6 through NIAH-9** for complete retrieval coverage
5. **Fix NIAH-10 requiredFacts** for consensus-quorum needle
6. **Re-run KA-4 in isolation** (not shared with RC-4) for clean JSON persistence

---

## Result Files

All raw data is in `benchmarks/orchestrator-benchmark/results/`:

| File | Task | Runs |
|------|------|------|
| `benchmark-2026-02-07-01-44-11` | NIAH-1 (vanilla only) | 9 |
| `benchmark-2026-02-07-01-44-17` | NIAH-1 (orchestrator only) | 9 |
| `benchmark-2026-02-07-02-02-41` | NIAH-5 | 18 |
| `benchmark-2026-02-07-02-29-24` | NIAH-10 | 18 |
| `benchmark-2026-02-07-10-42-00` | KA-3 | 18 |
| `benchmark-2026-02-07-10-42-01` | RC-3 | 18 |
| `benchmark-2026-02-07-10-52-33` | KA-1 | 18 |
| `benchmark-2026-02-07-10-52-36` | KA-2 | 18 |
| `benchmark-2026-02-07-11-15-31` | RC-1 | 18 |
| `benchmark-2026-02-07-11-15-32` | RC-2 | 18 |
| `benchmark-2026-02-07-11-36-31` | KA-4 + RC-4 (shared) | 30+ |
| `benchmark-2026-02-07-11-36-32` | RC-5 | 18 |
| `benchmark-2026-02-07-11-36-34` | RC-6 | 18 |
