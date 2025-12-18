// Attention Detection Engine - rule-based + optional LLM analysis
import { EventEmitter } from 'events';
import { AttentionDetectionEngine as IAttentionDetectionEngine, Transcript, AttentionDecision } from '../interfaces';

export interface DetectionResult {
  decision: AttentionDecision;
  confidence: number;
  matchedKeywords: string[];
  matchedPatterns: string[];
  usedLLM: boolean;
}

export interface LLMProvider {
  analyze(text: string, context?: string): Promise<{ confidence: number; reasoning: string }>;
}

export class AttentionDetectionEngineImpl extends EventEmitter implements IAttentionDetectionEngine {
  private attentionKeywords: Set<string> = new Set(['hey', 'hello', 'excuse me', 'hi']);
  private userName: string = '';
  private llmProvider: LLMProvider | null = null;
  private llmEnabled: boolean = false;
  private uncertaintyThreshold: number = 0.5;
  
  // Patterns for probable attention indicators
  private questionPatterns: RegExp[] = [
    /\?$/,                           // Ends with question mark
    /^(what|where|when|who|why|how|can|could|would|will|do|does|did|is|are|was|were)\b/i,
    /\b(you|your)\b.*\?/i,           // Questions directed at "you"
  ];
  
  private directAddressPatterns: RegExp[] = [
    /^(hey|hi|hello)\s+\w+/i,        // Greeting followed by name
    /\b(sir|ma'am|miss|mister)\b/i,  // Formal address
    /^(excuse me|pardon me)/i,       // Polite attention getters
    /\blook\b/i,                     // "Look" often precedes direct address
    /\blisten\b/i,                   // "Listen" often precedes direct address
  ];

  constructor() {
    super();
  }

  public setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
    this.llmEnabled = true;
  }

  public disableLLM(): void {
    this.llmEnabled = false;
  }

  public enableLLM(): void {
    if (this.llmProvider) {
      this.llmEnabled = true;
    }
  }

  public setUncertaintyThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Uncertainty threshold must be between 0 and 1');
    }
    this.uncertaintyThreshold = threshold;
  }

  public async analyzeTranscript(transcript: Transcript, sensitivity: number): Promise<AttentionDecision> {
    const result = await this.analyzeWithDetails(transcript, sensitivity);
    return result.decision;
  }

  public async analyzeWithDetails(transcript: Transcript, sensitivity: number): Promise<DetectionResult> {
    const text = transcript.text.toLowerCase().trim();
    
    if (!text) {
      return {
        decision: AttentionDecision.IGNORE,
        confidence: 1.0,
        matchedKeywords: [],
        matchedPatterns: [],
        usedLLM: false
      };
    }

    // Check for definite attention keywords
    const matchedKeywords = this.findMatchedKeywords(text);
    
    if (matchedKeywords.length > 0) {
      const result: DetectionResult = {
        decision: AttentionDecision.DEFINITELY_TO_ME,
        confidence: 0.95,
        matchedKeywords,
        matchedPatterns: [],
        usedLLM: false
      };
      this.emit('detection', result);
      return result;
    }

    // Check for probable attention patterns
    const matchedPatterns = this.findMatchedPatterns(text);
    
    if (matchedPatterns.length > 0) {
      const result: DetectionResult = {
        decision: AttentionDecision.PROBABLY_TO_ME,
        confidence: 0.7,
        matchedKeywords: [],
        matchedPatterns,
        usedLLM: false
      };
      this.emit('detection', result);
      return result;
    }

    // Rule-based detection is uncertain - consider LLM if enabled
    const ruleBasedConfidence = this.calculateRuleBasedConfidence(text);
    
    if (ruleBasedConfidence < this.uncertaintyThreshold && this.llmEnabled && this.llmProvider) {
      try {
        const llmResult = await this.invokeLLM(text, sensitivity);
        return llmResult;
      } catch (error) {
        // LLM failed, fall back to rule-based
        console.error('LLM analysis failed, falling back to rule-based:', error);
        this.emit('llm_fallback', { error, text });
      }
    }

    // Default to IGNORE if no indicators found
    const result: DetectionResult = {
      decision: AttentionDecision.IGNORE,
      confidence: 1 - ruleBasedConfidence,
      matchedKeywords: [],
      matchedPatterns: [],
      usedLLM: false
    };
    this.emit('detection', result);
    return result;
  }

  private findMatchedKeywords(text: string): string[] {
    const matched: string[] = [];
    
    // Check attention keywords
    for (const keyword of this.attentionKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }
    
    // Check user name if set
    if (this.userName && text.includes(this.userName.toLowerCase())) {
      matched.push(this.userName);
    }
    
    return matched;
  }

  private findMatchedPatterns(text: string): string[] {
    const matched: string[] = [];
    
    // Check question patterns
    for (const pattern of this.questionPatterns) {
      if (pattern.test(text)) {
        matched.push(`question:${pattern.source}`);
      }
    }
    
    // Check direct address patterns
    for (const pattern of this.directAddressPatterns) {
      if (pattern.test(text)) {
        matched.push(`direct:${pattern.source}`);
      }
    }
    
    return matched;
  }

  private calculateRuleBasedConfidence(text: string): number {
    let confidence = 0;
    
    // Increase confidence for conversational indicators
    if (text.includes('?')) confidence += 0.2;
    if (/\byou\b/i.test(text)) confidence += 0.15;
    if (/\byour\b/i.test(text)) confidence += 0.1;
    if (text.length < 50) confidence += 0.1; // Short utterances more likely directed
    if (/^[A-Z]/.test(text)) confidence += 0.05; // Starts with capital (proper sentence)
    
    return Math.min(confidence, 1);
  }

  private async invokeLLM(text: string, sensitivity: number): Promise<DetectionResult> {
    if (!this.llmProvider) {
      throw new Error('LLM provider not configured');
    }

    this.emit('llm_invoked', { text });
    
    const context = `Determine if this speech is directed at the listener. Sensitivity: ${sensitivity}`;
    const llmResponse = await this.llmProvider.analyze(text, context);
    
    // Combine LLM confidence with sensitivity to determine decision
    const adjustedConfidence = llmResponse.confidence * sensitivity;
    
    let decision: AttentionDecision;
    if (adjustedConfidence >= 0.8) {
      decision = AttentionDecision.DEFINITELY_TO_ME;
    } else if (adjustedConfidence >= 0.5) {
      decision = AttentionDecision.PROBABLY_TO_ME;
    } else {
      decision = AttentionDecision.IGNORE;
    }

    const result: DetectionResult = {
      decision,
      confidence: llmResponse.confidence,
      matchedKeywords: [],
      matchedPatterns: [],
      usedLLM: true
    };
    
    this.emit('llm_result', { result, reasoning: llmResponse.reasoning });
    return result;
  }

  public addKeyword(keyword: string): void {
    if (keyword && keyword.trim()) {
      this.attentionKeywords.add(keyword.toLowerCase().trim());
      this.emit('keyword_added', { keyword });
    }
  }

  public removeKeyword(keyword: string): boolean {
    const removed = this.attentionKeywords.delete(keyword.toLowerCase().trim());
    if (removed) {
      this.emit('keyword_removed', { keyword });
    }
    return removed;
  }

  public getKeywords(): string[] {
    return Array.from(this.attentionKeywords);
  }

  public setUserName(name: string): void {
    this.userName = name.trim();
    this.emit('username_set', { name: this.userName });
  }

  public getUserName(): string {
    return this.userName;
  }

  public addQuestionPattern(pattern: RegExp): void {
    this.questionPatterns.push(pattern);
  }

  public addDirectAddressPattern(pattern: RegExp): void {
    this.directAddressPatterns.push(pattern);
  }

  // Serialization for persistence
  public toJSON(): any {
    return {
      attentionKeywords: Array.from(this.attentionKeywords),
      userName: this.userName,
      llmEnabled: this.llmEnabled,
      uncertaintyThreshold: this.uncertaintyThreshold
    };
  }

  public fromJSON(data: any): void {
    if (data.attentionKeywords && Array.isArray(data.attentionKeywords)) {
      this.attentionKeywords = new Set(data.attentionKeywords);
    }
    if (typeof data.userName === 'string') {
      this.userName = data.userName;
    }
    if (typeof data.llmEnabled === 'boolean') {
      this.llmEnabled = data.llmEnabled && this.llmProvider !== null;
    }
    if (typeof data.uncertaintyThreshold === 'number') {
      this.uncertaintyThreshold = data.uncertaintyThreshold;
    }
  }
}