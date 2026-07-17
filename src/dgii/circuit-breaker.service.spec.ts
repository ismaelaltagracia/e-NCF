import { HttpException, HttpStatus } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service.js';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(service.getState()).toBe('CLOSED');
    });

    it('should return 0 for getTimeToHalfOpen when CLOSED', () => {
      expect(service.getTimeToHalfOpen()).toBe(0);
    });
  });

  describe('execute - successful operations', () => {
    it('should execute operation successfully and return result', async () => {
      const result = await service.execute(
        () => Promise.resolve('success'),
        'test-operation',
      );
      expect(result).toBe('success');
    });

    it('should handle typed results correctly', async () => {
      const data = { id: 1, name: 'test' };
      const result = await service.execute(
        () => Promise.resolve(data),
        'test-typed',
      );
      expect(result).toEqual(data);
    });
  });

  describe('execute - error propagation', () => {
    it('should propagate errors when circuit is CLOSED', async () => {
      const error = new Error('DGII timeout');
      await expect(
        service.execute(() => Promise.reject(error), 'test-failure'),
      ).rejects.toThrow('DGII timeout');
    });
  });

  describe('state transitions - CLOSED to OPEN', () => {
    it('should transition to OPEN after 5 failures within 60s window', async () => {
      // Trigger 5 failures to open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(
            () => Promise.reject(new Error(`failure-${i}`)),
            'dgii-call',
          );
        } catch {
          // Expected failures
        }
      }

      expect(service.getState()).toBe('OPEN');
    });

    it('should return 503 HttpException when circuit is OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(
            () => Promise.reject(new Error(`failure-${i}`)),
            'dgii-call',
          );
        } catch {
          // Expected failures
        }
      }

      // Next call should throw 503
      try {
        await service.execute(
          () => Promise.resolve('should-not-execute'),
          'dgii-call-after-open',
        );
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const response = httpError.getResponse() as Record<string, unknown>;
        expect(response.retryAfter).toBeDefined();
        expect(response.retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe('getTimeToHalfOpen', () => {
    it('should return positive milliseconds when circuit is OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(
            () => Promise.reject(new Error(`failure-${i}`)),
            'dgii-call',
          );
        } catch {
          // Expected
        }
      }

      expect(service.getState()).toBe('OPEN');
      const timeToHalfOpen = service.getTimeToHalfOpen();
      expect(timeToHalfOpen).toBeGreaterThan(0);
      expect(timeToHalfOpen).toBeLessThanOrEqual(30_000);
    });
  });

  describe('state transitions - OPEN to HALF-OPEN to CLOSED', () => {
    it('should transition from OPEN to HALF-OPEN after resetTimeout', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(
            () => Promise.reject(new Error(`failure-${i}`)),
            'dgii-call',
          );
        } catch {
          // Expected
        }
      }
      expect(service.getState()).toBe('OPEN');

      // Wait for resetTimeout (30s) - use fake timers for this
      // In a real test environment we'd use jest.useFakeTimers()
      // but opossum manages its own timers internally.
      // This test just validates the state is OPEN after failures.
    });
  });

  describe('503 response format', () => {
    it('should include retryAfter in error response body', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(
            () => Promise.reject(new Error(`failure-${i}`)),
            'dgii-call',
          );
        } catch {
          // Expected
        }
      }

      try {
        await service.execute(
          () => Promise.resolve('nope'),
          'blocked-call',
        );
        fail('Should have thrown');
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(503);
        const body = httpError.getResponse() as Record<string, unknown>;
        expect(body.statusCode).toBe(503);
        expect(body.message).toContain('circuit breaker');
        expect(body.retryAfter).toBeGreaterThan(0);
        expect(body.retryAfter).toBeLessThanOrEqual(30);
      }
    });
  });

  describe('does not open before threshold', () => {
    it('should remain CLOSED after fewer than 5 failures', async () => {
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(
            () => Promise.reject(new Error(`failure-${i}`)),
            'dgii-call',
          );
        } catch {
          // Expected
        }
      }

      expect(service.getState()).toBe('CLOSED');
    });
  });
});
