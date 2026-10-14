// Overlay key rotation must not touch the access codes or sign-ins; full rotation changes them all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store.js';
import { loadSecrets } from '../lib/auth.js';

const tmp = () => createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'dz-secrets-')));

test('rotate-overlay changes only the overlay key', () => {
  const store = tmp(), before = loadSecrets(store);
  const after = loadSecrets(store, { rotateOverlay: true });
  assert.notEqual(after.overlayKey, before.overlayKey);
  for (const k of ['directorCode', 'hostCode', 'cookieSecret', 'vdoStream', 'vdoPassword']) assert.equal(after[k], before[k], k);
  assert.deepEqual(loadSecrets(store), after, 'saved');
});

test('rotate-codes changes codes, overlay key and sessions; keeps VDO.Ninja ids', () => {
  const store = tmp(), before = loadSecrets(store);
  const after = loadSecrets(store, { rotate: true });
  for (const k of ['directorCode', 'hostCode', 'overlayKey', 'cookieSecret']) assert.notEqual(after[k], before[k], k);
  for (const k of ['vdoStream', 'vdoPassword']) assert.equal(after[k], before[k], k);
  assert.notEqual(after.directorCode, after.hostCode, 'Director and Host keep separate codes');
});
