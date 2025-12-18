/**
 * Property-based tests for Volume Action Dispatcher
 * **Feature: conversational-awareness-backend**
 */
import * as fc from 'fast-check';
import { VolumeActionDispatcherImpl } from '../services/VolumeActionDispatcher';
import { AttentionDecision, VolumeAction } from '../interfaces';

describe('Volume Action Dispatcher Property Tests', () => {
  let volumeDispatcher: VolumeActionDispatcherImpl;
  let receivedActions: VolumeAction[];

  beforeEach(() => {
    volumeDispatcher = new VolumeActionDispatcherImpl();
    receivedActions = [];
    volumeDispatcher.setActionCallback((action) => {
      receivedActions.push(action);
    });
  });

  afterEach(() => {
    volumeDispatcher.dispose();
  });

  /**
   * **Feature: conversational-awareness-backend, Property 17: Volume Action for Definite Attention**
   * *For any* Attention_Decision of DEFINITELY_TO_ME, a LOWER_VOLUME action 
   * should be sent to the frontend
   * **Validates: Requirements 5.1**
   */
  test('Property 17: DEFINITELY_TO_ME always triggers LOWER_VOLUME', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.1), max: Math.fround(1.0), noNaN: true }),
        async (sensitivity) => {
          receivedActions = [];
          const dispatcher = new VolumeActionDispatcherImpl();
          dispatcher.setActionCallback((action) => receivedActions.push(action));
          
          await dispatcher.dispatchAction(AttentionDecision.DEFINITELY_TO_ME, sensitivity);
          
          expect(receivedActions.length).toBe(1);
          expect(receivedActions[0].type).toBe('LOWER_VOLUME');
          expect(receivedActions[0].triggerReason).toBe(AttentionDecision.DEFINITELY_TO_ME);
          
          dispatcher.dispose();
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 18: Conditional Volume Action**
   * *For any* Attention_Decision of PROBABLY_TO_ME with Sensitivity_Level above 0.5, 
   * a LOWER_VOLUME action should be sent to the frontend
   * **Validates: Requirements 5.2**
   */
  test('Property 18: PROBABLY_TO_ME triggers LOWER_VOLUME only when sensitivity > 0.5', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.1), max: Math.fround(1.0), noNaN: true }),
        async (sensitivity) => {
          receivedActions = [];
          const dispatcher = new VolumeActionDispatcherImpl();
          dispatcher.setActionCallback((action) => receivedActions.push(action));
          
          await dispatcher.dispatchAction(AttentionDecision.PROBABLY_TO_ME, sensitivity);
          
          if (sensitivity > 0.5) {
            expect(receivedActions.length).toBe(1);
            expect(receivedActions[0].type).toBe('LOWER_VOLUME');
          } else {
            expect(receivedActions.length).toBe(0);
          }
          
          dispatcher.dispose();
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Feature: conversational-awareness-backend, Property 19: Volume Restoration Timeout**
   * *For any* period of no speech detection exceeding the configurable timeout, 
   * a RESTORE_VOLUME action should be sent to the frontend
   * **Validates: Requirements 5.3**
   */
  test('Property 19: Volume restores after silence timeout', async () => {
    const shortTimeout = 1000; // Minimum allowed timeout
    volumeDispatcher.setSilenceTimeout(shortTimeout);
    
    // First lower the volume
    await volumeDispatcher.dispatchAction(AttentionDecision.DEFINITELY_TO_ME, 0.7);
    expect(receivedActions.length).toBe(1);
    expect(receivedActions[0].type).toBe('LOWER_VOLUME');
    
    // Wait for timeout
    await new Promise(r => setTimeout(r, shortTimeout + 100));
    
    // Should have received RESTORE_VOLUME
    expect(receivedActions.length).toBe(2);
    expect(receivedActions[1].type).toBe('RESTORE_VOLUME');
  }, 10000);

  /**
   * **Feature: conversational-awareness-backend, Property 20: Volume Action Metadata**
   * *For any* Volume_Action sent, it should include a timestamp and the 
   * triggering Attention_Decision for frontend logging
   * **Validates: Requirements 5.4**
   */
  test('Property 20: Volume actions include required metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          AttentionDecision.DEFINITELY_TO_ME,
          AttentionDecision.PROBABLY_TO_ME
        ),
        fc.float({ min: Math.fround(0.6), max: Math.fround(1.0), noNaN: true }),
        async (decision, sensitivity) => {
          receivedActions = [];
          const dispatcher = new VolumeActionDispatcherImpl();
          dispatcher.setActionCallback((action) => receivedActions.push(action));
          
          await dispatcher.dispatchAction(decision, sensitivity);
          
          if (receivedActions.length > 0) {
            const action = receivedActions[0];
            
            // Must have timestamp
            expect(action.timestamp).toBeInstanceOf(Date);
            
            // Must have trigger reason
            expect(action.triggerReason).toBeDefined();
            expect([
              AttentionDecision.DEFINITELY_TO_ME,
              AttentionDecision.PROBABLY_TO_ME,
              AttentionDecision.IGNORE
            ]).toContain(action.triggerReason);
            
            // Must have confidence
            expect(typeof action.confidence).toBe('number');
            expect(action.confidence).toBeGreaterThanOrEqual(0);
            expect(action.confidence).toBeLessThanOrEqual(1);
          }
          
          dispatcher.dispose();
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});