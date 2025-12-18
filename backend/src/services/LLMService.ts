// LLM Service - Ollama integration for intent detection
import { EventEmitter } from 'events';

export interface LLMConfig {
  baseUrl: string;
  model: string;
  timeout: number;
}

export interface IntentAnalysis {
  isDirectedAtUser: boolean;
  confidence: number;
  reasoning: string;
}

export class LLMService extends EventEmitter {
  private config: LLMConfig;
  private conversationHistory: string[] = [];
  private maxHistoryLength: number = 10;
  private isAvailable: boolean = false;

  constructor(config?: Partial<LLMConfig>) {
    super();
    this.config = {
      baseUrl: config?.baseUrl || 'http://localhost:11434',
      model: config?.model || 'llama3.2:1b',
      timeout: config?.timeout || 10000
    };
  }

  public async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      this.isAvailable = response.ok;
      if (this.isAvailable) {
        console.log('Ollama LLM service is available');
      }
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      console.log('Ollama LLM service not available - running without LLM');
      return false;
    }
  }

  public getIsAvailable(): boolean {
    return this.isAvailable;
  }

  public addToHistory(text: string): void {
    this.conversationHistory.push(text);
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory.shift();
    }
  }

  public clearHistory(): void {
    this.conversationHistory = [];
  }

  public async analyzeIntent(currentText: string): Promise<IntentAnalysis> {
    if (!this.isAvailable) {
      return {
        isDirectedAtUser: false,
        confidence: 0,
        reasoning: 'LLM not available'
      };
    }

    // Build context from conversation history
    const recentHistory = this.conversationHistory.slice(-5).join('\n');
    
    const prompt = `You are analyzing speech to determine if someone is talking TO the user (the person wearing headphones/listening to audio).

Recent conversation context:
${recentHistory || '(no prior context)'}

Current speech to analyze:
"${currentText}"

Determine if this speech is DIRECTED AT the user. Consider:
- Direct address (names, "hey", "excuse me")
- Questions that expect a response
- Commands or requests
- Context from previous messages

Respond with ONLY a JSON object (no markdown, no explanation):
{"directed": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}`;

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 100
          }
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as { response?: string };
      const responseText = data.response?.trim() || '';
      
      // Parse JSON response
      const result = this.parseResponse(responseText);
      
      this.emit('analysis_complete', { text: currentText, result });
      return result;

    } catch (error) {
      console.error('LLM analysis error:', error);
      this.emit('analysis_error', { text: currentText, error });
      return {
        isDirectedAtUser: false,
        confidence: 0,
        reasoning: 'Analysis failed'
      };
    }
  }

  private parseResponse(responseText: string): IntentAnalysis {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isDirectedAtUser: Boolean(parsed.directed),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
          reasoning: String(parsed.reason || 'No reason provided')
        };
      }
    } catch {
      // Fallback: look for keywords in response
      const lower = responseText.toLowerCase();
      if (lower.includes('true') || lower.includes('yes') || lower.includes('directed')) {
        return {
          isDirectedAtUser: true,
          confidence: 0.6,
          reasoning: 'Parsed from non-JSON response'
        };
      }
    }

    return {
      isDirectedAtUser: false,
      confidence: 0.5,
      reasoning: 'Could not parse response'
    };
  }

  public setModel(model: string): void {
    this.config.model = model;
  }

  public getModel(): string {
    return this.config.model;
  }
}
