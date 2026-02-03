/**
 * Scorer - Evaluates benchmark outputs against ground truth
 *
 * For known-answer tasks (KA-1 through KA-4), this compares
 * the model's output against the computed ground truth.
 *
 * Note: KA-5 (trace task) was moved to RC-6 as trace completeness is subjective.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { BenchmarkTask, KnownAnswerScore } from './types.js';

const GROUND_TRUTH_PATH = join(import.meta.dirname, 'tasks/setup/ground-truth.json');

interface GroundTruth {
  generatedAt: string;
  tasks: {
    'KA-1': {
      totalCount: number;
      handlers: Array<{ channel: string; file: string }>;
    };
    'KA-2': {
      totalCount: number;
      singletons: Array<{ className: string; file: string }>;
    };
    'KA-3': {
      totalCount: number;
      importingFiles: Array<{ file: string }>;
    };
    'KA-4': {
      totalCount: number;
      bugs: Array<{ id: string; description: string }>;
    };
  };
}

let cachedGroundTruth: GroundTruth | null = null;

/**
 * Load ground truth from file
 */
function loadGroundTruth(): GroundTruth {
  if (cachedGroundTruth) return cachedGroundTruth;

  if (!existsSync(GROUND_TRUTH_PATH)) {
    throw new Error(
      `Ground truth not found at ${GROUND_TRUTH_PATH}. Run: npx ts-node tasks/setup/ground-truth.ts`
    );
  }

  cachedGroundTruth = JSON.parse(readFileSync(GROUND_TRUTH_PATH, 'utf-8'));
  return cachedGroundTruth!;
}

/**
 * Score a known-answer task output against ground truth
 */
export function scoreKnownAnswer(task: BenchmarkTask, output: string): KnownAnswerScore {
  switch (task.id) {
    case 'KA-1':
      return scoreKA1(output);
    case 'KA-2':
      return scoreKA2(output);
    case 'KA-3':
      return scoreKA3(output);
    case 'KA-4':
      return scoreKA4(output);
    default:
      throw new Error(`Unknown known-answer task: ${task.id}`);
  }
}

/**
 * KA-1: Score IPC handler detection
 * Checks if output mentions the expected IPC channels
 */
function scoreKA1(output: string): KnownAnswerScore {
  const gt = loadGroundTruth().tasks['KA-1'];
  const outputLower = output.toLowerCase();

  let found = 0;
  let falseNegatives = 0;
  const expectedChannels = gt.handlers.map(h => h.channel);

  for (const channel of expectedChannels) {
    // Check if the channel name appears in output
    if (outputLower.includes(channel.toLowerCase())) {
      found++;
    } else {
      falseNegatives++;
    }
  }

  // Check for false positives (mentioned channels not in ground truth)
  // This is approximate - look for patterns like "ipcMain.handle('something')"
  const mentionedChannels = extractMentionedChannels(output);
  const falsePositives = mentionedChannels.filter(
    c => !expectedChannels.some(ec => ec.toLowerCase() === c.toLowerCase())
  ).length;

  const correctness = gt.totalCount > 0 ? (found / gt.totalCount) * 100 : 0;

  return {
    correctness: Math.round(correctness * 10) / 10,
    falseNegatives,
    falsePositives,
  };
}

/**
 * KA-2: Score singleton service detection
 */
function scoreKA2(output: string): KnownAnswerScore {
  const gt = loadGroundTruth().tasks['KA-2'];
  const outputLower = output.toLowerCase();

  let found = 0;
  let falseNegatives = 0;
  const expectedClasses = gt.singletons.map(s => s.className);

  for (const className of expectedClasses) {
    if (outputLower.includes(className.toLowerCase())) {
      found++;
    } else {
      falseNegatives++;
    }
  }

  // Check for false positives - classes mentioned that aren't singletons
  const mentionedClasses = extractMentionedClasses(output);
  const falsePositives = mentionedClasses.filter(
    c => !expectedClasses.some(ec => ec.toLowerCase() === c.toLowerCase())
  ).length;

  const correctness = gt.totalCount > 0 ? (found / gt.totalCount) * 100 : 0;

  return {
    correctness: Math.round(correctness * 10) / 10,
    falseNegatives,
    falsePositives,
  };
}

/**
 * KA-3: Score orchestration-handler import detection
 */
function scoreKA3(output: string): KnownAnswerScore {
  const gt = loadGroundTruth().tasks['KA-3'];
  const outputLower = output.toLowerCase();

  let found = 0;
  let falseNegatives = 0;
  const expectedFiles = gt.importingFiles.map(f => f.file);

  for (const file of expectedFiles) {
    // Extract just the filename without path for more flexible matching
    const fileName = file.split('/').pop() || file;
    if (outputLower.includes(fileName.toLowerCase().replace('.ts', ''))) {
      found++;
    } else {
      falseNegatives++;
    }
  }

  // For this task, false positives are less meaningful
  const falsePositives = 0;

  const correctness = gt.totalCount > 0 ? (found / gt.totalCount) * 100 : 0;

  return {
    correctness: Math.round(correctness * 10) / 10,
    falseNegatives,
    falsePositives,
  };
}

/**
 * KA-4: Score bug detection
 */
function scoreKA4(output: string): KnownAnswerScore {
  const gt = loadGroundTruth().tasks['KA-4'];
  const outputLower = output.toLowerCase();

  let found = 0;
  let falseNegatives = 0;

  // Check if each bug's key characteristics are mentioned
  const bugIndicators = [
    ['off-by-one', 'indexof', 'includes', 'first child'],  // BUG-001
    ['null', 'undefined', 'assertion', 'non-null'],        // BUG-002
    ['timeout', 'multiplier', '1000', 'minutes'],          // BUG-003
  ];

  for (let i = 0; i < gt.bugs.length; i++) {
    const indicators = bugIndicators[i] || [];
    const matchCount = indicators.filter(ind => outputLower.includes(ind)).length;

    // Consider found if at least 2 indicators match
    if (matchCount >= 2) {
      found++;
    } else {
      falseNegatives++;
    }
  }

  // Check if output mentions bugs that don't exist
  const bugMentions = (output.match(/bug/gi) || []).length;
  const falsePositives = Math.max(0, bugMentions - gt.totalCount - 3); // Allow some leeway

  const correctness = gt.totalCount > 0 ? (found / gt.totalCount) * 100 : 0;

  return {
    correctness: Math.round(correctness * 10) / 10,
    falseNegatives,
    falsePositives,
  };
}

// Helper functions

function extractMentionedChannels(output: string): string[] {
  // Look for patterns like 'CHANNEL_NAME' or "channel-name"
  const matches = output.match(/['"`]([A-Z_]+(?:_[A-Z_]+)*|[a-z-]+(?:-[a-z]+)*)['"`]/g) || [];
  return matches
    .map(m => m.replace(/['"`]/g, ''))
    .filter(m => m.includes('_') || m.includes('-'));
}

function extractMentionedClasses(output: string): string[] {
  // Look for PascalCase class names
  const matches = output.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || [];
  return [...new Set(matches)];
}

/**
 * Get a human-readable summary of the score
 */
export function formatScore(score: KnownAnswerScore): string {
  return [
    `Correctness: ${score.correctness}%`,
    `False negatives: ${score.falseNegatives}`,
    `False positives: ${score.falsePositives}`,
  ].join('\n');
}

/**
 * Check if ground truth exists
 */
export function hasGroundTruth(): boolean {
  return existsSync(GROUND_TRUTH_PATH);
}
