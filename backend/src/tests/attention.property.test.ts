/**
 * Property-based tests for Attention Detection Engine
 * **Feature: conversational-awareness-backend**
 */
import * as fc from 'fast-check';
import { AttentionDetectionEngineImpl, LLMProvider } from '../services/AttentionDetectionEngine';
import { AttentionDecision } from '../interfaces';

describe('Attention Detection Engine Property Tests', () => {
  let attentionEngine: AttentionDetectionEngineImpl;

  beforeEach(() => {
    attentionEngine = new AttentionDetectionEngineImpl();
  });

  /**
   * **Feature: conversational-awareness-backend, Property 14: Attention Detection Logic**
   * *For any* Transcript, the attention decision should be DEFINITELY_TO_ME for 
   * attention keywords, PROBABLY_TO_ME for probable indicators, and IGNORE for no indicators
   * **Validates: Requirements 4.1, 4.2, 4.3**
   */
  test('Property 14: Attention detection returns correct decisions based on content', async () => {
    const keywords = ['hey', 'hello', 'excuse me'];
    
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Texts with keywords -> DEFINITELY_TO_ME
          fc.constantFrom(...keywords).map(k => ({ text: `${k} there`, expected: AttentionDecision.DEFINITELY_TO_ME })),
          // Questions -> PROBABLY_TO_ME
          fc.constantFrom('what time is it?', 'can you help?', 'where is it?').map(t => ({ text: t, expected: AttentionDecision.PROBABLY_TO_ME })),
          // Neutral text -> IGNORE
          fc.constantFrom('the weather is nice', 'I went to the store', 'random conversation').map(t => ({ text: t, expected: AttentionDecision.IGNORE }))
        ),
        async ({ text, expected }) => {
          const transcript = {
            id: '1',
            text,
            confidence: 0.9,
            timestamp: new Date(),
            isPartial: false,
            audioSegmentId: '1'
          };

          const decision = await attentionEngine.analyzeTranscript(transcript, 0.7);
          expect(decision).toBe(expected);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 15: LLM Fallback Invocation**
   * *For any* uncertain rule-based detection with confidence below threshold, 
   * the optional LLM should be invoked for contextual analysis
   * **Validates: Requirements 4.4**
   */
  test('Property 15: LLM is invoked when rule-based detection is uncertain', async () => {
    let llmInvoked = false;
    
    const mockLLM: LLMProvider = {
      analyze: async (text: string) => {
        llmInvoked = true;
        return { confidence: 0.8, reasoning: 'Test reasoning' };
      }
    };
    
    attentionEngine.setLLMProvider(mockLLM);
    attentionEngine.setUncertaintyThreshold(0.9); // High threshold to trigger LLM
    
    const transcript = {
      id: '1',
      text: 'some ambiguous text',
      confidence: 0.9,
      timestamp: new Date(),
      isPartial: false,
      audioSegmentId: '1'
    };

    await attentionEngine.analyzeTranscript(transcript, 0.7);
    expect(llmInvoked).toBe(true);
  });

  /**
   * **Feature: conversational-awareness-backend, Property 16: LLM Score Integration**
   * *For any* confidence score returned by LLM, it should be combined with 
   * Sensitivity_Level to determine the final Attention_Decision
   * **Validates: Requirements 4.5**
   */
  test('Property 16: LLM score combined with sensitivity determines decision', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.1), max: Math.fround(1.0), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(1.0), noNaN: true }),
        async (llmConfidence, sensitivity) => {
          const mockLLM: LLMProvider = {
            analyze: async () => ({ confidence: llmConfidence, reasoning: 'Test' })
          };
          
          const engine = new AttentionDetectionEngineImpl();
          engine.setLLMProvider(mockLLM);
          engine.setUncertaintyThreshold(0.9);
          
          const transcript = {
            id: '1',
            text: 'ambiguous text',
            confidence: 0.9,
            timestamp: new Date(),
            isPartial: false,
            audioSegmentId: '1'
          };

          const decision = await engine.analyzeTranscript(transcript, sensitivity);
          const adjustedConfidence = llmConfidence * sensitivity;
          
          if (adjustedConfidence >= 0.8) {
            expect(decision).toBe(AttentionDecision.DEFINITELY_TO_ME);
          } else if (adjustedConfidence >= 0.5) {
            expect(decision).toBe(AttentionDecision.PROBABLY_TO_ME);
          } else {
            expect(decision).toBe(AttentionDecision.IGNORE);
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 27: LLM Fallback Behavior**
   * *For any* LLM service unavailability, the system should fall back to 
   * rule-based detection only
   * **Validates: Requirements 7.2**
   */
  test('Property 27: Falls back to rule-based when LLM fails', async () => {
    const mockLLM: LLMProvider = {
      analyze: async () => { throw new Error('LLM unavailable'); }
    };
    
    attentionEngine.setLLMProvider(mockLLM);
    attentionEngine.setUncertaintyThreshold(0.9);
    
    const transcript = {
      id: '1',
      text: 'hey there',
      confidence: 0.9,
      timestamp: new Date(),
      isPartial: false,
      audioSegmentId: '1'
    };

    // Should not throw, should fall back to rule-based
    const decision = await attentionEngine.analyzeTranscript(transcript, 0.7);
    
    // "hey" is a keyword, so should be DEFINITELY_TO_ME from rule-based
    expect(decision).toBe(AttentionDecision.DEFINITELY_TO_ME);
  });
});