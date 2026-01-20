/**
 * LLM Service for RLM
 * Provides summarization and sub-query capabilities
 *
 * Uses lightweight API calls rather than spawning CLI processes
 * for faster response times on quick tasks.
 */

import { EventEmitter } from 'events';

export interface LLMServiceConfig {
  provider: 'anthropic' | 'ollama' | 'openai' | 'local';
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ollamaHost?: string;
}

export interface SummarizeRequest {
  requestId: string;
  content: string;
  targetTokens: number;
  preserveKeyPoints?: boolean;
}

export interface SummarizeResponse {
  requestId: string;
  summary: string;
  originalTokens: number;
  summaryTokens: number;
}

export interface SubQueryRequest {
  requestId: string;
  prompt: string;
  context: string;
  depth: number;
}

export interface SubQueryResponse {
  requestId: string;
  response: string;
  depth: number;
  tokens: { input: number; output: number };
}

const DEFAULT_CONFIG: LLMServiceConfig = {
  provider: 'local', // Start with local fallback
  maxTokens: 4096,
  temperature: 0.3,
  timeout: 60000,
  ollamaHost: 'http://localhost:11434',
};

// System prompts
const SUMMARIZE_SYSTEM_PROMPT = `You are a precise summarizer. Your task is to summarize the given content while:
1. Preserving all key points, facts, and important details
2. Maintaining technical accuracy
3. Reducing the text to the target length
4. Using clear, concise language
5. Organizing information logically

Do not add new information or opinions. Only summarize what is provided.`;

const SUBQUERY_SYSTEM_PROMPT = `You are an intelligent assistant helping to answer questions about code and documentation.
You have access to the following context. Use it to answer the user's question accurately.
If the context doesn't contain enough information, say so clearly.
Be concise but thorough.`;

export class LLMService extends EventEmitter {
  private static instance: LLMService;
  private config: LLMServiceConfig;
  private anthropicAvailable: boolean | null = null;
  private ollamaAvailable: boolean | null = null;
  private openaiAvailable: boolean | null = null;

  private constructor(config: Partial<LLMServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<LLMServiceConfig>): LLMService {
    if (!this.instance) {
      this.instance = new LLMService(config);
    }
    return this.instance;
  }

  configure(config: Partial<LLMServiceConfig>): void {
    this.config = { ...this.config, ...config };
    // Reset availability checks when config changes
    if (config.anthropicApiKey !== undefined) this.anthropicAvailable = null;
    if (config.openaiApiKey !== undefined) this.openaiAvailable = null;
    if (config.ollamaHost !== undefined) this.ollamaAvailable = null;
  }

  getConfig(): LLMServiceConfig {
    return { ...this.config };
  }

  /**
   * Summarize content to target token count
   */
  async summarize(request: SummarizeRequest): Promise<string> {
    const userPrompt = `Please summarize the following content to approximately ${request.targetTokens} tokens:

${request.content}

Summary:`;

    try {
      const summary = await this.generateCompletion(SUMMARIZE_SYSTEM_PROMPT, userPrompt);

      this.emit('summarize:complete', {
        requestId: request.requestId,
        summary,
        originalTokens: Math.ceil(request.content.length / 4),
        summaryTokens: Math.ceil(summary.length / 4),
      } as SummarizeResponse);

      return summary;
    } catch (error) {
      this.emit('summarize:error', {
        requestId: request.requestId,
        error: (error as Error).message,
      });

      // Return fallback summary
      return this.fallbackSummarize(request.content, request.targetTokens);
    }
  }

  /**
   * Execute a sub-query against context
   */
  async subQuery(request: SubQueryRequest): Promise<string> {
    const userPrompt = `Context:
${request.context}

Question: ${request.prompt}

Answer:`;

    try {
      const response = await this.generateCompletion(SUBQUERY_SYSTEM_PROMPT, userPrompt);

      this.emit('sub_query:complete', {
        requestId: request.requestId,
        response,
        depth: request.depth,
        tokens: {
          input: Math.ceil((request.context.length + request.prompt.length) / 4),
          output: Math.ceil(response.length / 4),
        },
      } as SubQueryResponse);

      return response;
    } catch (error) {
      this.emit('sub_query:error', {
        requestId: request.requestId,
        error: (error as Error).message,
      });

      return `Unable to process sub-query: ${(error as Error).message}`;
    }
  }

  /**
   * Generate a completion using the configured provider
   */
  private async generateCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
    // Try providers in order of preference based on config
    if (this.config.provider === 'anthropic' || this.config.anthropicApiKey) {
      try {
        return await this.generateWithAnthropic(systemPrompt, userPrompt);
      } catch (error) {
        this.anthropicAvailable = false;
        this.emit('provider:error', { provider: 'anthropic', error });
      }
    }

    if (this.config.provider === 'ollama' || this.ollamaAvailable !== false) {
      try {
        return await this.generateWithOllama(systemPrompt, userPrompt);
      } catch (error) {
        this.ollamaAvailable = false;
        this.emit('provider:error', { provider: 'ollama', error });
      }
    }

    if (this.config.provider === 'openai' || this.config.openaiApiKey) {
      try {
        return await this.generateWithOpenAI(systemPrompt, userPrompt);
      } catch (error) {
        this.openaiAvailable = false;
        this.emit('provider:error', { provider: 'openai', error });
      }
    }

    // Fall back to local extraction
    return this.generateLocal(userPrompt);
  }

  /**
   * Generate completion using Anthropic API
   */
  private async generateWithAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const model = this.config.model || 'claude-3-haiku-20240307'; // Use Haiku for speed

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      content: { type: string; text: string }[];
    };

    this.anthropicAvailable = true;
    return data.content[0]?.text || '';
  }

  /**
   * Generate completion using Ollama
   */
  private async generateWithOllama(systemPrompt: string, userPrompt: string): Promise<string> {
    const host = this.config.ollamaHost || 'http://localhost:11434';
    const model = this.config.model || 'llama3';

    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `${systemPrompt}\n\nUser: ${userPrompt}`,
        stream: false,
        options: {
          temperature: this.config.temperature || 0.3,
          num_predict: this.config.maxTokens || 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    this.ollamaAvailable = true;
    return data.response || '';
  }

  /**
   * Generate completion using OpenAI API
   */
  private async generateWithOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const model = this.config.model || 'gpt-4o-mini'; // Use mini for speed

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
    };

    this.openaiAvailable = true;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Local extraction without LLM (fallback)
   */
  private generateLocal(prompt: string): string {
    // For summarization, extract key content
    // For sub-queries, return a message that LLM is unavailable
    if (prompt.includes('summarize')) {
      const content = prompt.split('Summary:')[0];
      const targetMatch = prompt.match(/approximately (\d+) tokens/);
      const targetTokens = targetMatch ? parseInt(targetMatch[1]) : 500;
      return this.fallbackSummarize(content, targetTokens);
    }

    return '[LLM unavailable - unable to process query. Please configure an LLM provider (Anthropic, OpenAI, or Ollama) for intelligent responses.]';
  }

  /**
   * Fallback summarization without LLM
   */
  private fallbackSummarize(content: string, targetTokens: number): string {
    const targetChars = targetTokens * 4;
    const lines = content.split('\n');

    // Extract key lines (headers, first sentences, etc.)
    const keyLines: string[] = [];
    let currentChars = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Prioritize headers and important patterns
      const isHeader = /^#+\s/.test(trimmed) || /^[A-Z][^.]*:/.test(trimmed);
      const isImportant = /^(NOTE|IMPORTANT|TODO|WARNING|CRITICAL)/i.test(trimmed);

      if (isHeader || isImportant || keyLines.length < 5) {
        if (currentChars + trimmed.length <= targetChars) {
          keyLines.push(trimmed);
          currentChars += trimmed.length;
        }
      }
    }

    // If we have room, add more content
    for (const line of lines) {
      if (currentChars >= targetChars) break;
      const trimmed = line.trim();
      if (!trimmed || keyLines.includes(trimmed)) continue;

      if (currentChars + trimmed.length <= targetChars) {
        keyLines.push(trimmed);
        currentChars += trimmed.length;
      }
    }

    return keyLines.join('\n');
  }

  /**
   * Check if LLM service is available
   */
  async isAvailable(): Promise<boolean> {
    // Check configured provider first
    if (this.config.provider === 'anthropic' && this.config.anthropicApiKey) {
      return true;
    }
    if (this.config.provider === 'openai' && this.config.openaiApiKey) {
      return true;
    }
    if (this.config.provider === 'ollama') {
      return await this.checkOllamaAvailability();
    }
    if (this.config.provider === 'local') {
      return true; // Local fallback is always available
    }

    // Check any available provider
    if (this.config.anthropicApiKey || this.config.openaiApiKey) {
      return true;
    }
    return await this.checkOllamaAvailability();
  }

  /**
   * Check if Ollama is available
   */
  async checkOllamaAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.ollamaHost}/api/tags`, {
        method: 'GET',
      });
      this.ollamaAvailable = response.ok;
      return this.ollamaAvailable;
    } catch {
      this.ollamaAvailable = false;
      return false;
    }
  }

  /**
   * Get provider status
   */
  getProviderStatus(): {
    anthropic: boolean | null;
    ollama: boolean | null;
    openai: boolean | null;
    local: boolean;
  } {
    return {
      anthropic: this.config.anthropicApiKey ? this.anthropicAvailable : null,
      ollama: this.ollamaAvailable,
      openai: this.config.openaiApiKey ? this.openaiAvailable : null,
      local: true, // Always available
    };
  }
}

export function getLLMService(config?: Partial<LLMServiceConfig>): LLMService {
  return LLMService.getInstance(config);
}
