import { LLMManager } from '../services/llm/manager.js';
import { LLMConfig, LLMProviderType } from '../services/llm/types.js';

let llmManager: LLMManager | null = null;

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

export class LLMConfigManager {
  private createConfigForProvider(provider: LLMProviderType): LLMConfig | null {
    switch (provider) {
      case 'openai-compatible': {
        const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
        if (!apiKey) return null;
        return {
          provider: 'openai-compatible',
          model: process.env.OPENAI_COMPATIBLE_MODEL || 'kimi-k2.6',
          api_key: apiKey,
          base_url: process.env.OPENAI_COMPATIBLE_BASE_URL,
          disable_tools: parseBooleanEnv(process.env.OPENAI_COMPATIBLE_DISABLE_TOOLS, true),
          max_tokens: 1000,
          temperature: 0.7
        };
      }
      case 'gemini': {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return null;
        return {
          provider: 'gemini',
          model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
          api_key: apiKey,
          max_tokens: 1000,
          temperature: 0.7
        };
      }
      case 'claude': {
        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey) return null;
        return {
          provider: 'claude',
          model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
          api_key: apiKey,
          max_tokens: 1000,
          temperature: 0.7
        };
      }
      case 'openai': {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;
        return {
          provider: 'openai',
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          api_key: apiKey,
          max_tokens: 1000,
          temperature: 0.7
        };
      }
      case 'perplexity': {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) return null;
        return {
          provider: 'perplexity',
          model: process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-small-128k-online',
          api_key: apiKey,
          max_tokens: 1000,
          temperature: 0.7
        };
      }
      default:
        return null;
    }
  }

  private async detectAndCreateConfig(): Promise<LLMConfig> {
    const primaryProvider = (process.env.PRIMARY_LLM_PROVIDER || 'gemini') as LLMProviderType;
    const primaryConfig = this.createConfigForProvider(primaryProvider);
    if (primaryConfig) return primaryConfig;

    const fallbackOrder: LLMProviderType[] = [
      'gemini',
      'claude',
      'openai',
      'perplexity',
      'openai-compatible'
    ];

    for (const provider of fallbackOrder) {
      const config = this.createConfigForProvider(provider);
      if (config) return config;
    }

    throw new Error('No LLM API keys found in environment variables (OPENAI_COMPATIBLE_API_KEY, GEMINI_API_KEY, CLAUDE_API_KEY, OPENAI_API_KEY, PERPLEXITY_API_KEY)');
  }

  private async getLLMManager(): Promise<LLMManager> {
    if (!llmManager) {
      llmManager = new LLMManager();
      const config = await this.detectAndCreateConfig();
      console.log(`🤖 Initializing LLM with provider: ${config.provider}`);
      const success = await llmManager.initialize(config);
      if (!success) {
        throw new Error(`Failed to initialize LLM manager with ${config.provider}`);
      }
    }
    return llmManager;
  }

  async initializeLLM(): Promise<boolean> {
    try {
      await this.getLLMManager();
      return true;
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      return false;
    }
  }

  getCurrentInfo(): any {
    if (!llmManager) {
      return { provider: 'none', initialized: false };
    }
    const pricing = llmManager.getCurrentPricing();
    return {
      provider: pricing?.provider || 'unknown',
      model: pricing?.model || 'unknown',
      initialized: true
    };
  }

  async testConfiguration(): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      const manager = await this.getLLMManager();
      const testPrompt = 'Say "LLM test successful" if you can read this.';
      const response = await manager.analyzeFantasyData({
        context: {
          week: 1,
          day_of_week: 'Monday',
          action_type: 'analysis',
          priority: 'low'
        },
        data: {
          rosters: [],
          injuries: [],
          waiver_targets: [],
          league_info: [{ test_prompt: testPrompt }]
        }
      });

      return {
        success: true,
        response: response.summary
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateResponse(prompt: string): Promise<{ content: string; cost?: number }> {
    const manager = await this.getLLMManager();

    // Use direct LLM provider chat for simple text generation
    // This bypasses the complex fantasy analysis tools that might be causing issues
    try {
      const provider = manager.getCurrentProvider();
      if (!provider) {
        throw new Error('No LLM provider initialized');
      }

      const response = await provider.chat([
        { role: 'user', content: prompt }
      ], {
        max_tokens: 1000,
        temperature: 0.7
      });

      return {
        content: response.content || 'No response generated',
        cost: response.usage?.total_tokens ? response.usage.total_tokens * 0.000001 : 0.001 // Rough estimate
      };
    } catch (directError: any) {
      console.warn('Direct LLM call failed, trying fantasy analysis method:', directError.message);

      // Fallback to fantasy analysis method
      const response = await manager.analyzeFantasyData({
        context: {
          week: 1,
          day_of_week: 'Monday',
          action_type: 'analysis',
          priority: 'medium'
        },
        data: {
          rosters: [],
          injuries: [],
          waiver_targets: [],
          league_info: [{ custom_prompt: prompt }]
        }
      });

      return {
        content: response.summary || 'Analysis completed',
        cost: response.cost_estimate?.estimated_cost
      };
    }
  }

  async switchProvider(provider: LLMProviderType): Promise<boolean> {
    try {
      const config = this.createConfigForProvider(provider);
      if (!config) {
        throw new Error(`No API key found for ${provider}`);
      }

      llmManager = new LLMManager();
      const success = await llmManager.initialize(config);
      return success;
    } catch (error) {
      console.error('Failed to switch provider:', error);
      return false;
    }
  }
}

export const llmConfig = new LLMConfigManager();