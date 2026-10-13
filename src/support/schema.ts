import { expect } from '@playwright/test';
import { z } from 'zod';

/** Validates a response body against a zod schema and fails with readable field paths. */
export function expectSchema<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  const issues = result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  expect(issues, 'Response does not match the contract').toEqual([]);
  return result.data as z.infer<S>;
}
