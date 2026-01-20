# Multi-Agent Verification UI - Implementation Todo List

**Generated:** January 2026
**Source:** Analysis of `multi_agent_verification_ui.md` design spec vs current implementation

---

## Summary

The multi-agent verification UI is **largely implemented** with most core components in place. However, there are several gaps that need to be addressed before the feature is fully complete.

### Implementation Status Overview

| Category                | Status        | Details                                        |
| ----------------------- | ------------- | ---------------------------------------------- |
| Verification Components | 85% Complete  | 11/13 components exist, 2 missing              |
| Common Components       | 100% Complete | All 5 components exist                         |
| Agent Components        | 100% Complete | All 4 components exist                         |
| State Stores            | 80% Complete  | Stores exist but AgentStore missing features   |
| IPC Handlers            | 70% Complete  | Handlers exist but preload exposure incomplete |
| Services (Hooks equiv.) | 100% Complete | All 4 services exist                           |

---

## Priority 1: Missing Components

### P1.1 - Create AgentSelector Component

**Status:** ❌ NOT IMPLEMENTED
**Location:** Should be at `src/renderer/app/features/verification/agent-selector.component.ts`
**Design Spec:** Section 3.1 - Quick Start area shows agent selector dropdowns

**Description:**
A component for selecting which CLI/API agents to include in a verification session. Should support:

- Multi-select dropdown interface
- Show available vs unavailable agents
- Quick add/remove functionality
- Integration with CliDetectionPanel for status

**Acceptance Criteria:**

- [ ] Create `agent-selector.component.ts`
- [ ] Support multiple agent selection with max limit
- [ ] Show agent status indicators (available/unavailable)
- [ ] Integrate with VerificationStore for selected agents
- [ ] Export from verification module index.ts

---

### P1.2 - Create ResultsComparison Component

**Status:** ❌ NOT IMPLEMENTED
**Location:** Should be at `src/renderer/app/features/verification/results-comparison.component.ts`
**Design Spec:** Section 3.4 - Results Comparison View

**Description:**
A side-by-side comparison view for agent responses. Different from existing `VerificationResults` component which shows synthesized results.

**Features needed:**

- Side-by-side columns for each agent's response
- Topic-by-topic navigation
- Highlight agreements and disagreements
- Per-topic confidence scores
- Previous/Next topic navigation

**Acceptance Criteria:**

- [ ] Create `results-comparison.component.ts`
- [ ] Support N-column layout for N agents
- [ ] Topic navigation with prev/next
- [ ] Visual diff highlighting for disagreements
- [ ] Per-agent confidence display
- [ ] Export from verification module index.ts

---

## Priority 2: IPC/Preload Gaps

### P2.1 - Add Missing IPC Channel Exposures in Preload

**Status:** ⚠️ PARTIAL
**Location:** `src/preload/preload.ts`

The IPC handlers exist in `src/main/ipc/cli-verification-ipc-handler.ts` but are not exposed to the renderer via preload.

**Missing channels to add:**

- [ ] `cli:detect-one` - Detect single CLI by command
- [ ] `cli:test-connection` - Test CLI connection
- [ ] `verification:start-cli` - Start CLI-based verification
- [ ] `verification:cancel` - Cancel verification

**Tasks:**

- [ ] Add channel constants to `IPC_CHANNELS` object in preload.ts
- [ ] Create wrapper functions to expose these to renderer
- [ ] Update `ElectronIpcService` to use new channels
- [ ] Test IPC communication end-to-end

---

### P2.2 - Fix IPC Channel Naming Inconsistencies

**Status:** ⚠️ INCONSISTENT
**Locations:** `src/preload/preload.ts`, `src/main/ipc/cli-verification-ipc-handler.ts`

**Inconsistencies found:**
| Preload Name | Handler Name | Action |
|--------------|--------------|--------|
| `cli:check` | `cli:detect-one` | Reconcile naming |
| `verification:verify-multi` | `verification:start-cli` | Reconcile naming |

**Tasks:**

- [ ] Decide on canonical channel names
- [ ] Update preload.ts to match handler names (or vice versa)
- [ ] Update all references in renderer services
- [ ] Test affected functionality

---

### P2.3 - Implement Verification Cancellation

**Status:** ⚠️ STUB ONLY
**Location:** `src/main/ipc/cli-verification-ipc-handler.ts:205`

The `verification:cancel` handler exists but the `CliVerificationCoordinator` doesn't implement actual cancellation.

**Tasks:**

- [ ] Implement `cancel()` method in CliVerificationCoordinator
- [ ] Handle cleanup of running CLI processes
- [ ] Emit proper cancellation events to renderer
- [ ] Test cancellation during various verification stages

---

## Priority 3: State Store Improvements

### P3.1 - Add Per-CLI Preferences to AgentStore

**Status:** ⚠️ MISSING FROM SPEC
**Location:** `src/renderer/app/core/state/agent.store.ts`
**Design Spec:** Section 6.2 - Agent Store

The design doc specifies per-CLI user preferences that are not implemented:

**Interface to add:**

```typescript
interface AgentPreference {
  command: string;
  defaultModel?: string;
  defaultTimeout: number;
  autoApprove: boolean;
  personality?: string;
  customPath?: string;
}
```

**Tasks:**

- [ ] Add `preferences: Map<string, AgentPreference>` to AgentStore
- [ ] Implement `setPreference(command, pref)` action
- [ ] Implement `getPreference(command)` selector
- [ ] Add default preferences for common CLIs (claude, gemini, codex, ollama)
- [ ] Persist preferences to localStorage
- [ ] Wire up to AgentConfigPanel component

---

### P3.2 - Consolidate CLI Detection State

**Status:** ⚠️ DUPLICATED
**Locations:** `cli.store.ts`, `verification.store.ts`

CLI detection state exists in both stores. Consider consolidation:

**Tasks:**

- [ ] Audit both stores for CLI detection functionality
- [ ] Decide on single source of truth for CLI state
- [ ] Refactor to remove duplication
- [ ] Update dependent components

---

## Priority 4: Integration & Polish

### P4.1 - Wire Up Verification Dashboard Route

**Status:** ⚠️ NEEDS VERIFICATION
**Location:** `src/renderer/app/app.routes.ts`

Ensure verification dashboard is accessible from app navigation.

**Tasks:**

- [ ] Verify route exists for verification feature
- [ ] Add navigation link to sidebar/menu if missing
- [ ] Test navigation flow

---

### P4.2 - Connect Components to Services

**Status:** ⚠️ NEEDS VERIFICATION

Verify all verification components are properly wired to their services:

**Tasks:**

- [ ] VerificationDashboard uses VerificationStore
- [ ] VerificationMonitor uses AgentStreamService
- [ ] DebateRoundViewer uses DebateStreamingService
- [ ] CliDetectionPanel uses CliDetectionService
- [ ] Test data flow end-to-end

---

### P4.3 - Implement Export Functionality

**Status:** ⚠️ NEEDS VERIFICATION
**Location:** `src/renderer/app/features/verification/export-panel.component.ts`

Verify export panel has working export functionality:

**Tasks:**

- [ ] Test Markdown export
- [ ] Test JSON export
- [ ] Test HTML export
- [ ] Implement PDF export if missing
- [ ] Include debate rounds in export (optional)
- [ ] Include raw responses in export (optional)

---

## Priority 5: Documentation & Cleanup

### P5.1 - Update Design Doc for Angular Architecture

**Status:** 📝 DOCUMENTATION
**Location:** `multi_agent_verification_ui.md`

The design doc uses React patterns (hooks, TSX) but implementation is Angular.

**Tasks:**

- [ ] Update file structure section for Angular conventions (.component.ts)
- [ ] Replace hook references with Angular service equivalents
- [ ] Update code examples to Angular syntax
- [ ] Mark document as "Implemented" with Angular notes

---

### P5.2 - Add Missing Component Tests

**Status:** 📝 QUALITY

**Tasks:**

- [ ] Add unit tests for AgentSelector (when created)
- [ ] Add unit tests for ResultsComparison (when created)
- [ ] Add integration tests for verification flow
- [ ] Add E2E tests for multi-agent verification

---

## Summary Table

| ID   | Task                                | Priority | Effort | Status             |
| ---- | ----------------------------------- | -------- | ------ | ------------------ |
| P1.1 | Create AgentSelector Component      | P0       | 2d     | Not Started        |
| P1.2 | Create ResultsComparison Component  | P0       | 3d     | Not Started        |
| P2.1 | Add Missing IPC Exposures           | P0       | 1d     | Not Started        |
| P2.2 | Fix IPC Naming Inconsistencies      | P1       | 0.5d   | Not Started        |
| P2.3 | Implement Verification Cancellation | P1       | 1d     | Not Started        |
| P3.1 | Add Per-CLI Preferences             | P1       | 1d     | Not Started        |
| P3.2 | Consolidate CLI Detection State     | P2       | 0.5d   | Not Started        |
| P4.1 | Wire Up Dashboard Route             | P1       | 0.5d   | Needs Verification |
| P4.2 | Connect Components to Services      | P1       | 1d     | Needs Verification |
| P4.3 | Implement Export Functionality      | P2       | 1d     | Needs Verification |
| P5.1 | Update Design Doc                   | P3       | 0.5d   | Not Started        |
| P5.2 | Add Component Tests                 | P3       | 2d     | Not Started        |

**Total Estimated Effort:** ~14 days

---

## What's Already Complete ✅

### Verification Components (11/13)

- VerificationDashboard
- AgentCard
- AgentConfigPanel
- VerificationLauncher
- VerificationMonitor
- AgentResponseStream
- ProgressTracker
- SynthesisViewer
- DebateRoundViewer
- ConsensusHeatmap
- ExportPanel

### Common/Shared Components (5/5)

- StreamingText
- TokenCounter
- CostEstimator
- ConfidenceMeter
- TimelineView

### Agent Components (4/4)

- CliStatusIndicator
- CliDetectionPanel
- AgentPersonalityPicker
- AgentCapabilityBadges

### Settings Components (3/3)

- CliSettingsPanel
- ApiKeyManager
- VerificationPreferences

### Services (4/4)

- CliDetectionService
- VerificationService
- AgentStreamService
- DebateStreamingService

### State Stores (3/3 core)

- VerificationStore (comprehensive)
- SettingsStore (comprehensive)
- AgentStore (basic - needs enhancement)

---

_Document generated by Claude Orchestrator analysis_

## James notes

I want to be able to add files to the message by dragging to the entire chat window, not jst the message input area.
When I use the initial "what would you like to chat about" window and type, it starts the instance and I lose my initial message from the conversation history.
