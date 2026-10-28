import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isExpoGoEnvironment, makeSafeLoader } from './expoGo.ts';

test('Expo Go is recognised by its execution environment, and by the old appOwnership flag', () => {
  assert.equal(isExpoGoEnvironment({ executionEnvironment: 'storeClient', appOwnership: null }), true);
  assert.equal(isExpoGoEnvironment({ executionEnvironment: undefined, appOwnership: 'expo' }), true);
  assert.equal(isExpoGoEnvironment({ executionEnvironment: 'storeClient', appOwnership: 'expo' }), true);
});

test('a development build, a standalone build and a bare build are not Expo Go', () => {
  assert.equal(isExpoGoEnvironment({ executionEnvironment: 'standalone', appOwnership: null }), false);
  assert.equal(isExpoGoEnvironment({ executionEnvironment: 'bare', appOwnership: null }), false);
  assert.equal(isExpoGoEnvironment({ executionEnvironment: 'bare', appOwnership: 'standalone' }), false);
  assert.equal(isExpoGoEnvironment({}), false);
});

test('the safe loader returns the module, and loads it only once', () => {
  let calls = 0;
  const get = makeSafeLoader(() => {
    calls += 1;
    return { name: 'notifications' };
  });
  assert.deepEqual(get(), { name: 'notifications' });
  assert.deepEqual(get(), { name: 'notifications' });
  assert.equal(calls, 1);
});

test('the safe loader never throws: a module that cannot load gives null, once, and is not retried', () => {
  let calls = 0;
  const failures: unknown[] = [];
  const get = makeSafeLoader(
    () => {
      calls += 1;
      throw new Error("Cannot find native module 'ExpoTopicSubscriptionModule'");
    },
    (error) => failures.push(error),
  );
  assert.equal(get(), null);
  assert.equal(get(), null);
  assert.equal(calls, 1);
  assert.equal(failures.length, 1);
  assert.match(String((failures[0] as Error).message), /ExpoTopicSubscriptionModule/);
});
