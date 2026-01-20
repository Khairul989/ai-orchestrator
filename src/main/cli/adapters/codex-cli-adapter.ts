/**
 * Codex CLI Adapter - Spawns and manages OpenAI Codex CLI processes
 * https://github.com/openai/codex
 *
 * Uses `codex exec` for non-interactive execution with JSONL output
 */

import {
  BaseCliAdapter,
  CliAdapterConfig,
  CliCapabilities,
  CliStatus,
  CliMessage,
  CliResponse,
  CliToolCall,
  CliUsage,
} from './base-cli-adapter';

/**
 * Codex CLI specific configuration
 */
export interface CodexCliConfig {
  /** Model to use (gpt-4, o3, etc.) */
  model?: string;
  /** Approval mode: suggest, auto-edit, or full-auto */
  approvalMode?: 'suggest' | 'auto-edit' | 'full-auto';
  /** Sandbox mode: read-only, workspace-write, or danger-full-access */
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  /** Working directory */
  workingDir?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Codex CLI Adapter - Implementation for OpenAI Codex CLI
 */
export class CodexCliAdapter extends BaseCliAdapter {
  private cliConfig: CodexCliConfig;

  constructor(config: CodexCliConfig = {}) {
    const adapterConfig: CliAdapterConfig = {
      command: 'codex',
      args: [],
      cwd: config.workingDir,
      timeout: config.timeout || 300000,
      sessionPersistence: true,
    };
    super(adapterConfig);

    this.cliConfig = config;
    this.sessionId = `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============ BaseCliAdapter Abstract Implementations ============

  getName(): string {
    return 'codex-cli';
  }

  getCapabilities(): CliCapabilities {
    return {
      streaming: true,
      toolUse: true,
      fileAccess: true,
      shellExecution: true,
      multiTurn: true,
      vision: false, // Codex CLI doesn't support images (as of 2025)
      codeExecution: true,
      contextWindow: 128000, // GPT-4 context window
      outputFormats: ['text', 'json'],
    };
  }

  async checkStatus(): Promise<CliStatus> {
    return new Promise((resolve) => {
      const proc = this.spawnProcess(['--version']);
      let output = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      proc.stderr?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || output.includes('codex')) {
          const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
          resolve({
            available: true,
            version: versionMatch?.[1] || 'unknown',
            path: 'codex',
            authenticated: true, // Codex handles its own auth
          });
        } else {
          resolve({
            available: false,
            error: `Codex CLI not found or not configured: ${output}`,
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          available: false,
          error: `Failed to spawn codex: ${err.message}`,
        });
      });

      setTimeout(() => {
        proc.kill();
        resolve({
          available: false,
          error: 'Timeout checking Codex CLI',
        });
      }, 5000);
    });
  }

  async sendMessage(message: CliMessage): Promise<CliResponse> {
    const startTime = Date.now();
    this.outputBuffer = '';

    return new Promise((resolve, reject) => {
      const args = this.buildArgs(message);
      this.process = this.spawnProcess(args);

      // For `codex exec`, the prompt is passed as an argument, not via stdin
      // Close stdin since we're not using it
      if (this.process.stdin) {
        this.process.stdin.end();
      }

      this.process.stdout?.on('data', (data) => {
        const chunk = data.toString();
        this.outputBuffer += chunk;

        // Parse JSONL events and extract content
        const lines = chunk.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            // Handle Codex exec event types
            if (event.type === 'item.completed' && event.item?.text) {
              this.emit('output', event.item.text);
            } else if (event.type === 'message' && event.content) {
              this.emit('output', event.content);
            } else if (event.type === 'agent_message' && event.message?.content) {
              this.emit('output', event.message.content);
            }
          } catch {
            // Not JSON, may be plain text output - emit if it's not empty
            if (line.trim() && !line.startsWith('{')) {
              this.emit('output', line);
            }
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        const errorStr = data.toString();
        // Only emit as error if it's actually an error, not just progress info
        if (errorStr.includes('error') || errorStr.includes('Error') || errorStr.includes('fatal')) {
          this.emit('error', errorStr);
        }
      });

      this.process.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0 || this.outputBuffer) {
          const response = this.parseOutput(this.outputBuffer);
          response.usage = {
            ...response.usage,
            duration,
          };
          this.emit('complete', response);
          resolve(response);
        } else {
          reject(new Error(`Codex exited with code ${code}`));
        }
        this.process = null;
      });

      // Timeout handling
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGTERM');
          reject(new Error('Codex CLI timeout'));
        }
      }, this.config.timeout);

      this.process.on('close', () => clearTimeout(timeout));
    });
  }

  async *sendMessageStream(message: CliMessage): AsyncIterable<string> {
    const args = this.buildArgs(message);
    this.process = this.spawnProcess(args);

    // For `codex exec`, the prompt is passed as an argument, not via stdin
    if (this.process.stdin) {
      this.process.stdin.end();
    }

    const stdout = this.process.stdout;
    if (!stdout) return;

    for await (const chunk of stdout) {
      const chunkStr = chunk.toString();
      // Parse JSONL and extract content
      const lines = chunkStr.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          // Handle Codex exec event types
          if (event.type === 'item.completed' && event.item?.text) {
            yield event.item.text;
          } else if (event.type === 'message' && event.content) {
            yield event.content;
          } else if (event.type === 'agent_message' && event.message?.content) {
            yield event.message.content;
          }
        } catch {
          // Not JSON, yield if it looks like content
          if (line.trim() && !line.startsWith('{')) {
            yield line;
          }
        }
      }
    }
  }

  parseOutput(raw: string): CliResponse {
    const id = this.generateResponseId();

    // Try to parse JSONL output first
    const content = this.extractContentFromJsonl(raw);
    const toolCalls = this.extractToolCalls(raw);
    const usage = this.extractUsage(raw);

    return {
      id,
      content: content || this.cleanContent(raw),
      role: 'assistant',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      raw,
    };
  }

  /**
   * Extract content from JSONL output format
   * Codex exec outputs events in format:
   * - {"type":"item.completed","item":{"id":"...","type":"agent_message","text":"..."}}
   * - {"type":"turn.completed","usage":{...}}
   */
  private extractContentFromJsonl(raw: string): string {
    const contentParts: string[] = [];
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        // Handle Codex exec event types
        if (event.type === 'item.completed' && event.item?.text) {
          contentParts.push(event.item.text);
        } else if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item?.message?.content) {
          contentParts.push(event.item.message.content);
        } else if (event.type === 'message' && event.content) {
          contentParts.push(event.content);
        } else if (event.type === 'agent_message' && event.message?.content) {
          contentParts.push(event.message.content);
        } else if (event.type === 'text' && event.text) {
          contentParts.push(event.text);
        } else if (event.type === 'completion' && event.content) {
          contentParts.push(event.content);
        }
      } catch {
        // Not JSON, skip
      }
    }

    return contentParts.join('\n');
  }

  protected buildArgs(message: CliMessage): string[] {
    // Use `codex exec` for non-interactive execution
    const args: string[] = ['exec'];

    // Model selection
    if (this.cliConfig.model) {
      args.push('--model', this.cliConfig.model);
    }

    // Enable JSONL output for easier parsing
    args.push('--json');

    // Approval mode / sandbox settings
    if (this.cliConfig.approvalMode === 'full-auto') {
      // --full-auto is a convenience flag that sets sandbox to workspace-write
      args.push('--full-auto');
    } else if (this.cliConfig.sandboxMode) {
      args.push('--sandbox', this.cliConfig.sandboxMode);
    }

    // Working directory
    if (this.cliConfig.workingDir) {
      args.push('--cd', this.cliConfig.workingDir);
    }

    // Skip git repo check in case we're running outside a repo
    args.push('--skip-git-repo-check');

    // Handle image attachments
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.type === 'image' && attachment.path) {
          args.push('--image', attachment.path);
        }
      }
    }

    // Add the prompt as a positional argument (required for exec)
    if (message.content) {
      args.push(message.content);
    }

    return args;
  }

  // ============ Private Helper Methods ============

  private extractToolCalls(raw: string): CliToolCall[] {
    const toolCalls: CliToolCall[] = [];

    // Pattern for Codex tool execution blocks
    // Codex uses formats like [TOOL: name]...[/TOOL]
    const toolPattern = /\[TOOL:\s*(\w+)\]([\s\S]*?)\[\/TOOL\]/g;
    let match;

    while ((match = toolPattern.exec(raw)) !== null) {
      toolCalls.push({
        id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: match[1],
        arguments: { raw: match[2].trim() },
      });
    }

    // Also check for code block patterns that may indicate tool use
    const codePattern = /```(\w+)\n([\s\S]*?)```/g;
    while ((match = codePattern.exec(raw)) !== null) {
      const lang = match[1].toLowerCase();
      if (['bash', 'shell', 'sh'].includes(lang)) {
        toolCalls.push({
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: 'execute',
          arguments: { command: match[2].trim() },
        });
      }
    }

    return toolCalls;
  }

  private cleanContent(raw: string): string {
    // Remove tool blocks, thinking blocks, etc.
    return raw
      .replace(/\[TOOL:\s*\w+\][\s\S]*?\[\/TOOL\]/g, '')
      .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/g, '')
      .replace(/\[Codex\].*$/gm, '') // Remove status lines
      .trim();
  }

  private extractUsage(raw: string): CliUsage {
    // Try to extract usage from JSONL turn.completed event
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'turn.completed' && event.usage) {
          return {
            inputTokens: event.usage.input_tokens || 0,
            outputTokens: event.usage.output_tokens || 0,
            totalTokens: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
          };
        }
      } catch {
        // Not JSON, continue
      }
    }

    // Fallback: try to extract from raw text
    const tokensMatch = raw.match(/tokens:\s*(\d+)/i);
    const tokens = tokensMatch ? parseInt(tokensMatch[1]) : this.estimateTokens(raw);

    return {
      outputTokens: tokens,
      totalTokens: tokens,
    };
  }
}
