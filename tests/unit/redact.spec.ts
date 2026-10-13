import { test, expect } from '@playwright/test';
import { redact } from '../../src/api/redact';

/** The Allure report is public, so the key must never appear in attachments or errors. */
test.describe('API key redaction', () => {
  test('appid query parameter is masked', () => {
    expect(redact('https://api.example/weather?lat=1&appid=abc123&lon=2')).toBe(
      'https://api.example/weather?lat=1&appid=***&lon=2',
    );
  });

  test('the raw key is masked anywhere in a message', () => {
    expect(redact('connect ECONNRESET for key abc123', 'abc123')).toBe('connect ECONNRESET for key ***');
  });
});
