/**
 * Gemini CLI Adapter - Spawns and manages Google Gemini CLI processes
 * https://cloud.google.com/gemini
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
 * Gemini CLI specific configuration
 */
export interface GeminiCliConfig {
  /** Model to use (gemini-2.0-flash, gemini-1.5-pro, etc.) */
  model?: string;
  /** Run in sandbox mode */
  sandbox?: boolean;
  /** Working directory */
  workingDir?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Auto-approve mode (YOLO) */
  yolo?: boolean;
}

/**
 * Gemini CLI Adapter - Implementation for Google Gemini CLI
 */
export class GeminiCliAdapter extends BaseCliAdapter {
  private cliConfig: GeminiCliConfig;

  constructor(config: GeminiCliConfig = {}) {
    const adapterConfig: CliAdapterConfig = {
      command: 'gemini',
      args: [],
      cwd: config.workingDir,
      timeout: config.timeout || 300000,
      sessionPersistence: true,
    };
    super(adapterConfig);

    this.cliConfig = config;
    this.sessionId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============ BaseCliAdapter Abstract Implementations ============

  getName(): string {
    return 'gemini-cli';
  }

  getCapabilities(): CliCapabilities {
    return {
      streaming: true,
      toolUse: true,
      fileAccess: true,
      shellExecution: true,
      multiTurn: true,
      vision: true, // Gemini supports images
      codeExecution: true,
      contextWindow: 1000000, // Gemini 1.5 Pro has 1M+ context
      outputFormats: ['text', 'json', 'markdown'],
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
        if (code === 0 || output.includes('gemini')) {
          const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
          resolve({
            available: true,
            version: versionMatch?.[1] || 'unknown',
            path: 'gemini',
            authenticated: !output.includes('not authenticated'),
          });
        } else {
          resolve({
            available: false,
            error: `Gemini CLI not found or not configured: ${output}`,
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          available: false,
          error: `Failed to spawn gemini: ${err.message}`,
        });
      });

      setTimeout(() => {
        proc.kill();
        resolve({
          available: false,
          error: 'Timeout checking Gemini CLI',
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
          reject(new Error(`Gemini exited with code ${code}`));
        }
        this.process = null;
      });

      // Timeout handling
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGTERM');
          reject(new Error('Gemini CLI timeout'));
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

    if (this.cliConfig.sandbox) {
      args.push('--sandbox');
    }

    if (this.cliConfig.yolo) {
      args.push('--yolo'); // Or equivalent auto-approve flag
    }

    // Handle attachments
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.type === 'file' && attachment.path) {
          args.push('--file', attachment.path);
        } else if (attachment.type === 'image' && attachment.path) {
          args.push('--image', attachment.path);
        }
      }
    }

    return args;
  }

  // ============ Private Helper Methods ============

  private extractToolCalls(raw: string): CliToolCall[] {
    const toolCalls: CliToolCall[] = [];

    // Gemini tool patterns (based on typical CLI output format)
    // Pattern 1: ```tool\nfunctionName({...})\n```
    const toolPattern = /```tool\n(\w+)\(([\s\S]*?)\)\n```/g;
    let match;

    while ((match = toolPattern.exec(raw)) !== null) {
      try {
        toolCalls.push({
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: match[1],
          arguments: JSON.parse(match[2] || '{}'),
        });
      } catch {
        toolCalls.push({
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: match[1],
          arguments: { raw: match[2] },
        });
      }
    }

    // Pattern 2: Function call blocks
    const funcPattern = /\[Function:\s*(\w+)\]\s*\n([\s\S]*?)\[\/Function\]/g;
    while ((match = funcPattern.exec(raw)) !== null) {
      try {
        toolCalls.push({
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: match[1],
          arguments: JSON.parse(match[2] || '{}'),
        });
      } catch {
        toolCalls.push({
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: match[1],
          arguments: { raw: match[2] },
        });
      }
    }

    return toolCalls;
  }

  private cleanContent(raw: string): string {
    return raw
      .replace(/```tool\n[\s\S]*?\n```/g, '')
      .replace(/\[Function:\s*\w+\][\s\S]*?\[\/Function\]/g, '')
      .replace(/^\[.*?\]\s*/gm, '') // Remove status prefixes like [INFO], [DEBUG]
      .replace(/^##\s*Thinking\s*\n[\s\S]*?(?=\n##|\n\n|$)/gim, '') // Remove thinking sections
      .trim();
  }

  private extractUsage(raw: string): CliUsage {
    // Try to extract usage from Gemini output if present
    const usageMatch = raw.match(/tokens:\s*(\d+)/i);
    const tokens = usageMatch ? parseInt(usageMatch[1]) : this.estimateTokens(raw);

    return {
      outputTokens: tokens,
      totalTokens: tokens,
    };
  }
}
