import { describe, test, expect } from 'vitest';
import { APP_VERSION } from '../../src/version.js';

describe('APP_VERSION', () => {
  test('respecte le format SemVer 0.MINOR.PATCH', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
