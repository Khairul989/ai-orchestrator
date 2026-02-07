/**
 * Markdown Frontmatter Parser
 *
 * Small, dependency-light helper for parsing `---` YAML frontmatter blocks.
 * Intended for command/agent definitions stored as markdown.
 */

import * as yaml from 'js-yaml';

export interface FrontmatterParseResult<TData extends Record<string, unknown> = Record<string, unknown>> {
  data: TData;
  content: string;
  hasFrontmatter: boolean;
}

/**
 * Parse YAML frontmatter from a markdown file.
 *
 * - If no frontmatter is present, returns `{ data: {}, content: input }`.
 * - Only parses a frontmatter block at the start of the file.
 */
export function parseMarkdownFrontmatter<TData extends Record<string, unknown> = Record<string, unknown>>(
  input: string
): FrontmatterParseResult<TData> {
  const trimmed = input ?? '';
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {
      data: {} as TData,
      content: trimmed,
      hasFrontmatter: false,
    };
  }

  const rawYaml = match[1] ?? '';
  let data: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(rawYaml);
    if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // If YAML is invalid, treat as "no metadata" and keep content.
    data = {};
  }

  const content = trimmed.slice(match[0].length);
  return {
    data: data as TData,
    content,
    hasFrontmatter: true,
  };
}

