/**
 * Codex CLI Adapter - Spawns and manages OpenAI Codex CLI processes
 * https://github.com/openai/codex
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
  /** Model to use (gpt-4, etc.) */
  model?: string;
  /** Approval mode: suggest, auto-edit, or full-auto */
  approvalMode?: 'suggest' | 'auto-edit' | 'full-auto';
  /** Run in sandbox mode */
  sandbox?: boolean;
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

      // Write prompt to stdin
      if (this.process.stdin) {
        this.process.stdin.write(message.content);
        this.process.stdin.end();
      }

      this.process.stdout?.on('data', (data) => {
        const chunk = data.toString();
        this.outputBuffer += chunk;
        this.emit('output', chunk);
      });

      this.process.stderr?.on('data', (data) => {
        this.emit('error', data.toString());
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

    if (this.process.stdin) {
      this.process.stdin.write(message.content);
      this.process.stdin.end();
    }

    const stdout = this.process.stdout;
    if (!stdout) return;

    for await (const chunk of stdout) {
      yield chunk.toString();
    }
  }

  parseOutput(raw: string): CliResponse {
    const id = this.generateResponseId();
    const toolCalls = this.extractToolCalls(raw);
    const content = this.cleanContent(raw);
    const usage = this.extractUsage(raw);

    return {
      id,
      content,
      role: 'assistant',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      raw,
    };
  }

  protected buildArgs(message: CliMessage): string[] {
    const args: string[] = [];

    if (this.cliConfig.model) {
      args.push('--model', this.cliConfig.model);
    }

    if (this.cliConfig.approvalMode) {
      args.push('--approval-mode', this.cliConfig.approvalMode);
    }

    if (this.cliConfig.sandbox) {
      args.push('--sandbox');
    }

    // Handle attachments
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.type === 'file' && attachment.path) {
          args.push('--file', attachment.path);
        }
      }
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
    // Try to extract usage if present in output
    const tokensMatch = raw.match(/tokens:\s*(\d+)/i);
    const tokens = tokensMatch ? parseInt(tokensMatch[1]) : this.estimateTokens(raw);

    return {
      outputTokens: tokens,
      totalTokens: tokens,
    };
  }
}
