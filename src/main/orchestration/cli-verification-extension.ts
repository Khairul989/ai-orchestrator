/**
 * CLI Verification Extension - Extends MultiVerifyCoordinator for CLI agents
 * Enables heterogeneous multi-agent verification across different CLI tools
 */

import { EventEmitter } from 'events';
import {
  VerificationConfig,
  VerificationRequest,
  VerificationResult,
  AgentResponse,
  PersonalityType,
  createDefaultVerificationConfig,
} from '../../shared/types/verification.types';
import { ProviderType } from '../../shared/types/provider.types';
import { CliDetectionService, CliInfo, CliType } from '../cli/cli-detection';
import { getProviderRegistry } from '../providers/provider-registry';
import { BaseProvider } from '../providers/provider-interface';
import { selectPersonalities, PERSONALITY_PROMPTS } from './personalities';
import { generateId } from '../../shared/utils/id-generator';

/**
 * Configuration for CLI-based verification
 */
export interface CliVerificationConfig extends VerificationConfig {
  /** Specific CLIs to use: ['claude', 'codex', 'gemini'] */
  cliAgents?: CliType[];
  /** Prefer CLI over API when both available */
  preferCli?: boolean;
  /** Use API if CLI not available */
  fallbackToApi?: boolean;
  /** Allow mixing CLI and API agents */
  mixedMode?: boolean;
}

/**
 * Agent configuration for verification
 */
export interface AgentConfig {
  type: 'cli' | 'api';
  name: string;
  command?: string;
  provider: BaseProvider;
  personality?: PersonalityType;
}

/**
 * CLI to Provider type mapping
 */
const CLI_TO_PROVIDER: Record<string, ProviderType> = {
  'claude': 'claude-cli',
  'codex': 'openai',
  'gemini': 'google',
  'ollama': 'ollama',
};

/**
 * API fallback mapping for CLIs
 */
const API_FALLBACKS: Record<string, ProviderType> = {
  'claude': 'anthropic-api',
  'codex': 'openai',
  'gemini': 'google',
};

/**
 * CLI Verification Coordinator - Manages multi-CLI verification workflows
 */
export class CliVerificationCoordinator extends EventEmitter {
  private static instance: CliVerificationCoordinator;
  private cliDetection = CliDetectionService.getInstance();
  private registry = getProviderRegistry();
  private activeVerifications: Map<string, VerificationRequest> = new Map();
  private results: Map<string, VerificationResult> = new Map();

  private constructor() {
    super();
  }

  static getInstance(): CliVerificationCoordinator {
    if (!this.instance) {
      this.instance = new CliVerificationCoordinator();
    }
    return this.instance;
  }

  /**
   * Start verification with CLI agents
   */
  async startVerificationWithCli(
    request: { prompt: string; context?: string },
    config: CliVerificationConfig
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    // Detect available CLIs
    const detection = await this.cliDetection.detectAll();

    // Select agents based on config
    const agents = await this.selectAgents(config, detection.available);

    if (agents.length < 3) {
      this.emit('warning', {
        message: `Only ${agents.length} agents available. Byzantine tolerance requires 3+.`,
        available: agents.map(a => a.name),
      });
    }

    const verificationId = `cli-verify-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const verificationRequest: VerificationRequest = {
      id: verificationId,
      instanceId: 'cli-verification',
      prompt: request.prompt,
      config: {
        ...createDefaultVerificationConfig(),
        ...config,
        agentCount: agents.length,
      },
      context: request.context,
    };

    this.activeVerifications.set(verificationId, verificationRequest);
    this.emit('verification:started', { requestId: verificationId, agents: agents.map(a => a.name) });

    try {
      // Run verification
      const result = await this.runCliVerification(verificationRequest, agents);
      result.totalDuration = Date.now() - startTime;

      this.results.set(verificationId, result);
      this.activeVerifications.delete(verificationId);

      this.emit('verification:completed', result);
      return result;
    } catch (error) {
      this.activeVerifications.delete(verificationId);
      this.emit('verification:error', { requestId: verificationId, error });
      throw error;
    }
  }

  /**
   * Select agents based on configuration and available CLIs
   */
  private async selectAgents(
    config: CliVerificationConfig,
    availableClis: CliInfo[]
  ): Promise<AgentConfig[]> {
    const agents: AgentConfig[] = [];
    const personalities = selectPersonalities(config.agentCount || 3);
    let personalityIndex = 0;

    // If specific CLIs requested
    if (config.cliAgents && config.cliAgents.length > 0) {
      for (const cliName of config.cliAgents) {
        const cli = availableClis.find(c => c.name === cliName);

        if (cli?.installed) {
          try {
            const provider = this.registry.createCliProvider(cliName);
            agents.push({
              type: 'cli',
              name: cli.displayName,
              command: cli.command,
              provider,
              personality: personalities[personalityIndex++ % personalities.length],
            });
          } catch (error) {
            this.emit('warning', { message: `Failed to create CLI provider for ${cliName}`, error });
          }
        } else if (config.fallbackToApi) {
          // Try API fallback
          const apiType = API_FALLBACKS[cliName];
          if (apiType && this.registry.isSupported(apiType)) {
            try {
              const provider = this.registry.createProvider(apiType);
              agents.push({
                type: 'api',
                name: `${cliName}-api`,
                provider,
                personality: personalities[personalityIndex++ % personalities.length],
              });
            } catch (error) {
              this.emit('warning', { message: `Failed to create API fallback for ${cliName}`, error });
            }
          }
        }
      }
    } else {
      // Auto-select available CLIs
      for (const cli of availableClis) {
        if (agents.length >= (config.agentCount || 5)) break;

        try {
          const provider = this.registry.createCliProvider(cli.name);
          agents.push({
            type: 'cli',
            name: cli.displayName,
            command: cli.command,
            provider,
            personality: personalities[personalityIndex++ % personalities.length],
          });
        } catch (error) {
          this.emit('warning', { message: `Failed to create CLI provider for ${cli.name}`, error });
        }
      }

      // Add API agents if in mixed mode and need more agents
      if (config.mixedMode && agents.length < (config.agentCount || 3)) {
        const apiProviders = this.registry.getEnabledProviders();
        for (const apiConfig of apiProviders) {
          if (agents.length >= (config.agentCount || 5)) break;
          if (apiConfig.type.includes('cli')) continue; // Skip CLI-based providers

          try {
            const provider = this.registry.createProvider(apiConfig.type);
            agents.push({
              type: 'api',
              name: apiConfig.name,
              provider,
              personality: personalities[personalityIndex++ % personalities.length],
            });
          } catch (error) {
            this.emit('warning', { message: `Failed to create API provider for ${apiConfig.type}`, error });
          }
        }
      }
    }

    // Ensure minimum agent count by duplicating with different personalities
    while (agents.length < (config.agentCount || 3) && agents.length > 0) {
      const baseAgent = agents[0];
      agents.push({
        ...baseAgent,
        name: `${baseAgent.name}-${agents.length}`,
        personality: personalities[agents.length % personalities.length],
      });
    }

    return agents.slice(0, config.agentCount || 5);
  }

  /**
   * Run verification with selected agents
   */
  private async runCliVerification(
    request: VerificationRequest,
    agents: AgentConfig[]
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    this.emit('verification:agents-launching', {
      requestId: request.id,
      agentCount: agents.length,
      agents: agents.map(a => ({ name: a.name, type: a.type, personality: a.personality })),
    });

    // Run all agents in parallel
    const responsePromises = agents.map((agent, index) =>
      this.runAgent(request, agent, index)
    );

    const responses = await Promise.all(responsePromises);

    // Analyze responses
    const analysis = this.analyzeResponses(responses, request.config);

    // Synthesize final response
    const { synthesizedResponse, confidence } = this.synthesize(
      responses,
      analysis,
      request.config.synthesisStrategy
    );

    return {
      id: request.id,
      request,
      responses,
      analysis,
      synthesizedResponse,
      synthesisMethod: request.config.synthesisStrategy,
      synthesisConfidence: confidence,
      totalDuration: Date.now() - startTime,
      totalTokens: responses.reduce((sum, r) => sum + r.tokens, 0),
      totalCost: responses.reduce((sum, r) => sum + r.cost, 0),
      completedAt: Date.now(),
    };
  }

  /**
   * Run a single agent
   */
  private async runAgent(
    request: VerificationRequest,
    agent: AgentConfig,
    index: number
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const agentId = `${request.id}-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${index}`;

    try {
      // Build prompt with personality
      const systemPrompt = this.buildAgentPrompt(agent.personality);
      const fullPrompt = request.context
        ? `${request.context}\n\n${request.prompt}`
        : request.prompt;

      // Initialize provider
      await agent.provider.initialize({
        workingDirectory: process.cwd(),
        systemPrompt,
        yoloMode: true, // Auto-approve for verification
      });

      // Collect response
      let responseContent = '';
      let tokens = 0;

      agent.provider.on('output', (message: any) => {
        if (message.content) {
          responseContent += message.content;
          // Emit streaming event for real-time UI updates
          this.emit('verification:agent-stream', {
            requestId: request.id,
            agentId,
            agentName: agent.name,
            content: message.content,
            totalContent: responseContent,
          });
        }
      });

      agent.provider.on('context', (usage: any) => {
        tokens = usage.used || 0;
      });

      // Send message and wait for response
      await agent.provider.sendMessage(fullPrompt);

      // Wait a bit for any final events
      await new Promise(resolve => setTimeout(resolve, 500));

      // Terminate provider
      await agent.provider.terminate();

      // Emit agent complete event
      this.emit('verification:agent-complete', {
        requestId: request.id,
        agentId,
        agentName: agent.name,
        success: true,
        responseLength: responseContent.length,
        tokens,
      });

      const keyPoints = this.extractKeyPoints(responseContent);
      const confidence = this.extractConfidence(responseContent);

      return {
        agentId,
        agentIndex: index,
        model: `${agent.type}:${agent.name}`,
        personality: agent.personality,
        response: responseContent,
        keyPoints,
        confidence,
        duration: Date.now() - startTime,
        tokens,
        cost: this.estimateCost(tokens, agent.type),
      };
    } catch (error) {
      // Emit agent complete event with error
      this.emit('verification:agent-complete', {
        requestId: request.id,
        agentId,
        agentName: agent.name,
        success: false,
        error: (error as Error).message,
      });

      return {
        agentId,
        agentIndex: index,
        model: `${agent.type}:${agent.name}`,
        personality: agent.personality,
        response: '',
        keyPoints: [],
        confidence: 0,
        duration: Date.now() - startTime,
        tokens: 0,
        cost: 0,
        error: (error as Error).message,
        timedOut: (error as Error).message.includes('timeout'),
      };
    }
  }

  /**
   * Build agent prompt with personality
   */
  private buildAgentPrompt(personality?: PersonalityType): string {
    const personalitySection = personality && PERSONALITY_PROMPTS[personality]
      ? PERSONALITY_PROMPTS[personality] + '\n\n'
      : '';

    return `${personalitySection}You are participating in a multi-agent verification process.
Your response will be compared with other agents to synthesize the best answer.

## Instructions
1. Provide your best, most thorough response
2. Be explicit about your reasoning
3. Rate your confidence in each conclusion (0-100%)
4. If uncertain, say so explicitly
5. Highlight key points clearly

## Output Structure
End your response with a structured section:

## Key Points
- [Category: conclusion/recommendation/warning/fact] Point 1 (Confidence: X%)
- [Category] Point 2 (Confidence: X%)

## Overall Confidence
State your overall confidence in your response (0-100%): X%`;
  }

  /**
   * Extract key points from response
   */
  private extractKeyPoints(response: string): any[] {
    const keyPoints: any[] = [];
    const match = response.match(/## Key Points\n([\s\S]*?)(?=\n##|$)/i);

    if (match) {
      const lines = match[1].split('\n').filter(l => l.trim().startsWith('-'));
      for (const line of lines) {
        const categoryMatch = line.match(/\[(?:Category:\s*)?([\w-]+)\]/i);
        const confidenceMatch = line.match(/\(Confidence:\s*(\d+)%?\)/i);
        const content = line
          .replace(/^-\s*/, '')
          .replace(/\[.*?\]\s*/g, '')
          .replace(/\(Confidence:.*?\)/i, '')
          .trim();

        keyPoints.push({
          id: generateId(),
          content,
          category: categoryMatch?.[1]?.toLowerCase() || 'fact',
          confidence: confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.7,
        });
      }
    }

    return keyPoints;
  }

  /**
   * Extract confidence from response
   */
  private extractConfidence(response: string): number {
    const match = response.match(/Overall Confidence[:\s]*(\d+)%?/i);
    return match ? parseInt(match[1]) / 100 : 0.5;
  }

  /**
   * Analyze responses from all agents
   */
  private analyzeResponses(responses: AgentResponse[], config: VerificationConfig): any {
    const validResponses = responses.filter(r => !r.error);

    // Find agreements
    const agreements = this.findAgreements(validResponses);

    // Find disagreements
    const disagreements = this.findDisagreements(validResponses);

    // Rank responses
    const rankings = this.rankResponses(validResponses);

    // Detect outliers
    const outliers = this.detectOutliers(validResponses, agreements);

    // Calculate consensus strength
    const consensusStrength = agreements.length > 0
      ? agreements.reduce((sum, a) => sum + a.strength, 0) / agreements.length
      : 0;

    return {
      agreements,
      disagreements,
      uniqueInsights: [],
      responseRankings: rankings,
      overallConfidence: consensusStrength,
      outlierAgents: outliers,
      consensusStrength,
    };
  }

  /**
   * Find agreement points across responses
   */
  private findAgreements(responses: AgentResponse[]): any[] {
    const pointCounts = new Map<string, { point: any; agents: string[] }>();

    for (const response of responses) {
      for (const point of response.keyPoints) {
        const normalized = point.content.toLowerCase().trim();
        const existing = pointCounts.get(normalized) || { point, agents: [] };
        existing.agents.push(response.agentId);
        pointCounts.set(normalized, existing);
      }
    }

    return Array.from(pointCounts.values())
      .filter(p => p.agents.length >= 2)
      .map(p => ({
        point: p.point.content,
        category: p.point.category,
        agentIds: p.agents,
        strength: p.agents.length / responses.length,
        combinedConfidence: p.point.confidence,
      }));
  }

  /**
   * Find disagreement points
   */
  private findDisagreements(responses: AgentResponse[]): any[] {
    const recommendations = responses.flatMap(r =>
      r.keyPoints
        .filter(p => p.category === 'recommendation')
        .map(p => ({ ...p, agentId: r.agentId }))
    );

    if (recommendations.length <= 1) return [];

    const unique = new Set(recommendations.map(r => r.content.toLowerCase()));
    if (unique.size > 1) {
      return [{
        topic: 'Recommendations differ across agents',
        positions: recommendations.map(r => ({
          agentId: r.agentId,
          position: r.content,
          confidence: r.confidence,
        })),
        requiresHumanReview: true,
      }];
    }

    return [];
  }

  /**
   * Rank responses by quality
   */
  private rankResponses(responses: AgentResponse[]): any[] {
    return responses
      .map(r => {
        const completeness = Math.min(1, r.keyPoints.length / 5);
        const accuracy = r.confidence;
        const score = completeness * 0.3 + accuracy * 0.7;

        return {
          agentId: r.agentId,
          rank: 0,
          score,
          criteria: { completeness, accuracy },
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /**
   * Detect outlier agents
   */
  private detectOutliers(responses: AgentResponse[], agreements: any[]): string[] {
    const outliers: string[] = [];
    const majorityPoints = new Set(
      agreements.filter(a => a.strength >= 0.5).map(a => a.point.toLowerCase())
    );

    for (const response of responses) {
      const agentPoints = new Set(response.keyPoints.map(p => p.content.toLowerCase()));
      const overlap = [...agentPoints].filter(p => majorityPoints.has(p)).length;

      if (majorityPoints.size > 0 && overlap / majorityPoints.size < 0.3) {
        outliers.push(response.agentId);
      }
    }

    return outliers;
  }

  /**
   * Synthesize final response
   */
  private synthesize(
    responses: AgentResponse[],
    analysis: any,
    strategy: string
  ): { synthesizedResponse: string; confidence: number } {
    const validResponses = responses.filter(r => !r.error);

    if (validResponses.length === 0) {
      return {
        synthesizedResponse: 'All verification agents failed to respond.',
        confidence: 0,
      };
    }

    // Use best-of strategy by default
    const topRanked = analysis.responseRankings[0];
    const topResponse = validResponses.find(r => r.agentId === topRanked?.agentId);

    if (!topResponse) {
      return {
        synthesizedResponse: validResponses[0].response,
        confidence: 0.5,
      };
    }

    const agentTypes = responses.map(r => r.model.split(':')[0]);
    const uniqueTypes = [...new Set(agentTypes)];

    return {
      synthesizedResponse: `${topResponse.response}

---
*Multi-CLI Verification Summary*
- **Agents**: ${responses.length} (${uniqueTypes.join(', ')})
- **Agreement Points**: ${analysis.agreements.length}
- **Consensus Strength**: ${(analysis.consensusStrength * 100).toFixed(1)}%
- **Top Response**: ${topResponse.model} (${topResponse.personality || 'default'})`,
      confidence: Math.min(0.9, topRanked?.score || 0.5),
    };
  }

  /**
   * Estimate cost based on tokens and agent type
   */
  private estimateCost(tokens: number, agentType: string): number {
    const pricing: Record<string, number> = {
      'cli': 10, // $10 per million tokens (blended)
      'api': 15, // $15 per million tokens (blended)
    };
    const rate = pricing[agentType] || 10;
    return (tokens / 1_000_000) * rate;
  }

  // ============ Query Methods ============

  getResult(verificationId: string): VerificationResult | undefined {
    return this.results.get(verificationId);
  }

  getActiveVerifications(): VerificationRequest[] {
    return Array.from(this.activeVerifications.values());
  }

  getAllResults(): VerificationResult[] {
    return Array.from(this.results.values());
  }
}

/**
 * Get the CLI verification coordinator singleton
 */
export function getCliVerificationCoordinator(): CliVerificationCoordinator {
  return CliVerificationCoordinator.getInstance();
}
