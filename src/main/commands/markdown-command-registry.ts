/**
 * Markdown Command Registry
 *
 * Loads slash commands from markdown files with YAML frontmatter.
 * This is intentionally "in-repo" (no dependency on other project directories).
 *
 * Supported locations (global + per-working-directory):
 * - `~/.orchestrator/commands/**.md`
 * - `~/.claude/commands/**.md`
 * - `~/.opencode/command/**.md` and `~/.opencode/commands/**.md`
 * - `<cwd>/.orchestrator/commands/**.md`
 * - `<cwd>/.claude/commands/**.md`
 * - `<cwd>/.opencode/command/**.md` and `<cwd>/.opencode/commands/**.md`
 *
 * Later sources override earlier ones by command name.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import type { CommandTemplate } from '../../shared/types/command.types';
import { parseMarkdownFrontmatter } from '../../shared/utils/markdown-frontmatter';
import { generateId } from '../../shared/utils/id-generator';

type CommandFrontmatter = {
  name?: string;
  description?: string;
  'argument-hint'?: string;
  argumentHint?: string;
  hint?: string;
  model?: string;
  agent?: string;
  subtask?: boolean;
};

interface CacheEntry {
  loadedAt: number;
  commandsByName: Map<string, CommandTemplate>;
  candidatesByName: Map<string, CommandTemplate[]>;
  scanDirs: string[];
}

const CACHE_TTL_MS = 10_000;

export class MarkdownCommandRegistry {
  private static instance: MarkdownCommandRegistry | null = null;

  // Cache per working directory, because project-level commands are scoped.
  private cacheByWorkingDir = new Map<string, CacheEntry>();

  static getInstance(): MarkdownCommandRegistry {
    if (!MarkdownCommandRegistry.instance) {
      MarkdownCommandRegistry.instance = new MarkdownCommandRegistry();
    }
    return MarkdownCommandRegistry.instance;
  }

  private getHomeDir(): string | null {
    // `app.getPath('home')` is safe after app is ready; fall back to env for tests.
    try {
      return app.getPath('home');
    } catch {
      return process.env['HOME'] || process.env['USERPROFILE'] || null;
    }
  }

  private getScanRoots(workingDirectory: string): string[] {
    const home = this.getHomeDir();
    const roots: string[] = [];
    if (home) roots.push(home);
    roots.push(workingDirectory);
    return roots;
  }

  private getCommandDirs(root: string): string[] {
    // Keep this explicit and predictable. Later entries override earlier ones.
    return [
      path.join(root, '.orchestrator', 'commands'),
      path.join(root, '.orchestrator', 'command'),
      path.join(root, '.claude', 'commands'),
      path.join(root, '.claude', 'command'),
      path.join(root, '.opencode', 'commands'),
      path.join(root, '.opencode', 'command'),
    ];
  }

  private getAllScanDirs(workingDirectory: string): string[] {
    const dirs: string[] = [];
    for (const root of this.getScanRoots(workingDirectory)) {
      dirs.push(...this.getCommandDirs(root));
    }
    return dirs;
  }

  private async walkMarkdownFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    const stack: string[] = [dir];

    while (stack.length > 0) {
      const current = stack.pop()!;
      let entries: Array<import('fs').Dirent>;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          // Avoid accidentally scanning huge trees if someone misconfigures.
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          stack.push(full);
          continue;
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          out.push(full);
        }
      }
    }

    return out;
  }

  private deriveNameFromPath(commandsDir: string, filePath: string): string {
    const rel = path.relative(commandsDir, filePath);
    const withoutExt = rel.replace(/\.md$/i, '');
    // Use ":" instead of "/" so users can type `/foo:bar` (common convention in CLIs).
    return withoutExt.split(path.sep).filter(Boolean).join(':');
  }

  private extractHeadingTitle(markdown: string): string | null {
    const firstLine = (markdown || '').split('\n')[0] || '';
    const m = firstLine.match(/^#{1,6}\s+(.+)\s*$/);
    return m?.[1]?.trim() || null;
  }

  private toCommandTemplate(params: {
    name: string;
    template: string;
    description: string;
    hint?: string;
    filePath: string;
    model?: string;
    agent?: string;
    subtask?: boolean;
  }): CommandTemplate {
    const now = Date.now();
    return {
      id: `file-${generateId()}`,
      name: params.name,
      description: params.description,
      template: params.template,
      hint: params.hint,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
      source: 'file',
      filePath: params.filePath,
      model: params.model,
      agent: params.agent,
      subtask: params.subtask,
    };
  }

  private async loadCommandsForWorkingDirectory(workingDirectory: string): Promise<Map<string, CommandTemplate>> {
    const commandsByName = new Map<string, CommandTemplate>();
    const candidatesByName = new Map<string, CommandTemplate[]>();

    const roots = this.getScanRoots(workingDirectory);
    // Load low-to-high priority so later wins.
    for (const root of roots) {
      const dirs = this.getCommandDirs(root);
      for (const commandsDir of dirs) {
        const files = await this.walkMarkdownFiles(commandsDir);
        for (const filePath of files) {
          let raw: string;
          try {
            raw = await fs.readFile(filePath, 'utf-8');
          } catch {
            continue;
          }

          const parsed = parseMarkdownFrontmatter<CommandFrontmatter>(raw);
          const content = parsed.content.trim();
          if (!content) continue;

          const derivedName = this.deriveNameFromPath(commandsDir, filePath);
          const name = (parsed.data.name || derivedName).trim();
          if (!name) continue;

          const title = this.extractHeadingTitle(content);
          const description =
            (typeof parsed.data.description === 'string' && parsed.data.description.trim()) ||
            title ||
            `Custom command: ${name}`;

          const hint =
            (parsed.data['argument-hint'] as string | undefined) ||
            parsed.data.argumentHint ||
            parsed.data.hint;

          const template = content;

          const model = typeof parsed.data.model === 'string' ? parsed.data.model : undefined;
          const agent = typeof parsed.data.agent === 'string' ? parsed.data.agent : undefined;
          const subtask = typeof parsed.data.subtask === 'boolean' ? parsed.data.subtask : undefined;

          const cmd = this.toCommandTemplate({
            name,
            template,
            description,
            hint,
            filePath,
            model,
            agent,
            subtask,
          });

          const existing = candidatesByName.get(name) || [];
          existing.push(cmd);
          candidatesByName.set(name, existing);
          commandsByName.set(name, cmd);
        }
      }
    }

    const scanDirs = this.getAllScanDirs(workingDirectory);
    this.cacheByWorkingDir.set(workingDirectory, {
      loadedAt: Date.now(),
      commandsByName,
      candidatesByName,
      scanDirs,
    });
    return commandsByName;
  }

  async getCommand(workingDirectory: string, name: string): Promise<CommandTemplate | undefined> {
    const cacheKey = workingDirectory;
    const cached = this.cacheByWorkingDir.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
      return cached.commandsByName.get(name);
    }

    await this.loadCommandsForWorkingDirectory(workingDirectory);
    return this.cacheByWorkingDir.get(cacheKey)?.commandsByName.get(name);
  }

  async listCommands(workingDirectory: string): Promise<{
    commands: CommandTemplate[];
    candidatesByName: Record<string, CommandTemplate[]>;
    scanDirs: string[];
  }> {
    const cacheKey = workingDirectory;
    const cached = this.cacheByWorkingDir.get(cacheKey);
    const now = Date.now();

    if (!cached || now - cached.loadedAt >= CACHE_TTL_MS) {
      await this.loadCommandsForWorkingDirectory(workingDirectory);
    }

    const entry = this.cacheByWorkingDir.get(cacheKey)!;
    const commands = Array.from(entry.commandsByName.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const candidatesByName: Record<string, CommandTemplate[]> = {};
    for (const [name, list] of entry.candidatesByName.entries()) {
      candidatesByName[name] = list.slice();
    }

    return { commands, candidatesByName, scanDirs: entry.scanDirs.slice() };
  }

  clearCache(workingDirectory?: string): void {
    if (!workingDirectory) {
      this.cacheByWorkingDir.clear();
      return;
    }
    this.cacheByWorkingDir.delete(workingDirectory);
  }
}

let markdownCommandRegistry: MarkdownCommandRegistry | null = null;
export function getMarkdownCommandRegistry(): MarkdownCommandRegistry {
  if (!markdownCommandRegistry) {
    markdownCommandRegistry = MarkdownCommandRegistry.getInstance();
  }
  return markdownCommandRegistry;
}
