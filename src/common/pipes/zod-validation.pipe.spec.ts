import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().int().positive().optional(),
  });

  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(schema);
  });

  it('should return parsed data when validation succeeds', () => {
    const input = { name: 'Test', email: 'test@example.com', age: 25 };
    const result = pipe.transform(input, { type: 'body' });
    expect(result).toEqual(input);
  });

  it('should strip unknown properties from input', () => {
    const input = { name: 'Test', email: 'test@example.com', extra: 'field' };
    const result = pipe.transform(input, { type: 'body' });
    expect(result).toEqual({ name: 'Test', email: 'test@example.com' });
  });

  it('should throw BadRequestException on invalid data', () => {
    const input = { name: '', email: 'not-an-email' };

    expect(() => pipe.transform(input, { type: 'body' })).toThrow(BadRequestException);
  });

  it('should include validation details in the exception response', () => {
    const input = { name: '', email: 'invalid' };

    try {
      pipe.transform(input, { type: 'body' });
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).toHaveProperty('message', 'Validation failed');
      expect(response).toHaveProperty('details');
      expect((response as { details: unknown[] }).details.length).toBeGreaterThan(0);
    }
  });
});
