import { describe, expect, test } from 'vitest';
import { SERVICE_AUDIENCE_PATTERN } from '../../src/domain/audiences.ts';

describe('SERVICE_AUDIENCE_PATTERN', () => {
  test.each(['session', 'analytics.v2', 'a_b-c', '*'])('accepts %j', (audience) => {
    expect(SERVICE_AUDIENCE_PATTERN.test(audience)).toBe(true);
  });

  test.each(['', 'a b', 'svc*', '**', 'a/b', 'ü'])('rejects %j', (audience) => {
    expect(SERVICE_AUDIENCE_PATTERN.test(audience)).toBe(false);
  });
});

describe('parseServiceAudiences', () => {
  test.todo('accepts a non-empty list of valid audience strings');
  test.todo('rejects an empty list, non-arrays, and non-string entries');
  test.todo('rejects the reserved "idp" audience');
});

describe('isServiceAudienceAllowed', () => {
  test.todo('allows an audience listed explicitly');
  test.todo('allows any non-idp audience when the list contains "*"');
  test.todo('never allows "idp", even with "*"');
});
