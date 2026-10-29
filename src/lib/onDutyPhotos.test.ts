// Run with `npm test`. The On-Duty punch photo flow: how many photos, the "Photo 1 of 2" / "Photo 2 of 2" capture, retaking
// each, the multipart fields the server reads (`photo`, `photo2`), and the nice message for PHOTO2_REQUIRED.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureButtonLabel,
  confirmBlocker,
  describePunchError,
  isPhotoPlanComplete,
  newPhotoPlan,
  nextMissingPhoto,
  photoLabel,
  photoProgressText,
  photoSlotViews,
  punchFormEntries,
  requiredPhotoCount,
  withPhoto,
  withRequired,
} from './onDutyPhotos.ts';
import { camelToSnake, camelizeKeys, decamelizeKeys, snakeToCamel } from './caseKeys.ts';

test('how many photos: the status endpoint first, then the tracking state, default one; only a literal 2 means two', () => {
  assert.equal(requiredPhotoCount(2, 1), 2);
  assert.equal(requiredPhotoCount(1, 2), 1, 'the first definite answer wins');
  assert.equal(requiredPhotoCount(undefined, 2), 2, 'falls back to /tracking/state punchPhotos');
  assert.equal(requiredPhotoCount(undefined, undefined), 1);
  assert.equal(requiredPhotoCount(null, '2'), 2);
  assert.equal(requiredPhotoCount(3, 'x', {}), 1, 'junk means one');
  assert.equal(requiredPhotoCount(), 1);
});

test('one photo: a single slot labelled plainly', () => {
  let plan = newPhotoPlan(1);
  assert.deepEqual(plan.uris, [null]);
  assert.equal(photoLabel(0, 1), 'Photo');
  assert.equal(captureButtonLabel(plan), 'Take photo');
  assert.equal(isPhotoPlanComplete(plan), false);
  plan = withPhoto(plan, 0, 'file:///a.jpg');
  assert.equal(isPhotoPlanComplete(plan), true);
  assert.equal(nextMissingPhoto(plan), null);
  assert.equal(captureButtonLabel(plan), 'Retake');
});

test('two photos: "Photo 1 of 2" then "Photo 2 of 2", complete only with both', () => {
  let plan = newPhotoPlan(2);
  assert.equal(photoLabel(0, 2), 'Photo 1 of 2');
  assert.equal(photoLabel(1, 2), 'Photo 2 of 2');
  assert.equal(captureButtonLabel(plan), 'Take Photo 1 of 2');
  plan = withPhoto(plan, 0, 'file:///a.jpg');
  assert.equal(nextMissingPhoto(plan), 1);
  assert.equal(captureButtonLabel(plan), 'Take Photo 2 of 2');
  assert.equal(isPhotoPlanComplete(plan), false, 'one of two is not enough to submit');
  plan = withPhoto(plan, 1, 'file:///b.jpg');
  assert.equal(isPhotoPlanComplete(plan), true);
  assert.deepEqual(plan.uris, ['file:///a.jpg', 'file:///b.jpg']);
});

test('each photo can be retaken without disturbing the other, and the plan is never mutated', () => {
  const full = withPhoto(withPhoto(newPhotoPlan(2), 0, 'a'), 1, 'b');
  const retook1 = withPhoto(full, 0, 'a2');
  assert.deepEqual(retook1.uris, ['a2', 'b']);
  const retook2 = withPhoto(full, 1, 'b2');
  assert.deepEqual(retook2.uris, ['a', 'b2']);
  assert.deepEqual(full.uris, ['a', 'b']);
  assert.equal(withPhoto(full, 5, 'x'), full, 'a slot that does not exist is ignored');
  assert.equal(withPhoto(full, -1, 'x'), full);
});

test('the server switching to two photos mid-capture keeps the photo already taken and adds a slot', () => {
  const one = withPhoto(newPhotoPlan(1), 0, 'a');
  const two = withRequired(one, 2);
  assert.deepEqual(two.uris, ['a', null]);
  assert.equal(isPhotoPlanComplete(two), false);
  assert.deepEqual(withRequired(two, 1).uris, ['a']);
  assert.equal(withRequired(two, 2), two);
});

test('the punch form: latitude, longitude, accuracy, punchNumber, isMocked, then `photo` and `photo2`', () => {
  const entries = punchFormEntries({
    latitude: 11.0168, longitude: 76.9558, accuracy: 7.5, isMocked: false, punchNumber: 3, photoUris: ['file:///a.jpg', 'file:///b.jpg'],
  });
  assert.deepEqual(entries.map((e) => e.name), ['latitude', 'longitude', 'accuracy', 'punchNumber', 'isMocked', 'photo', 'photo2']);
  assert.equal(entries[0].value, '11.0168');
  assert.equal(entries[3].value, '3');
  assert.equal(entries[4].value, 'false');
  assert.deepEqual(entries[5].value, { uri: 'file:///a.jpg', name: 'punch.jpg', type: 'image/jpeg' });
  assert.deepEqual(entries[6].value, { uri: 'file:///b.jpg', name: 'punch2.jpg', type: 'image/jpeg' });
});

test('with one photo there is no `photo2`; optional fields are left out when absent', () => {
  const entries = punchFormEntries({ latitude: 1, longitude: 2, photoUris: ['file:///a.jpg'] });
  assert.deepEqual(entries.map((e) => e.name), ['latitude', 'longitude', 'isMocked', 'photo']);
});

test('PHOTO2_REQUIRED becomes a plain message that asks for the second photo / an app update, and says a second photo is needed', () => {
  const err = { response: { status: 400, data: { code: 'PHOTO2_REQUIRED', error: 'Two photos are required: please update the app' } } };
  const e = describePunchError(err);
  assert.equal(e.code, 'PHOTO2_REQUIRED');
  assert.equal(e.needsSecondPhoto, true);
  assert.match(e.message, /second photo/i);
  assert.match(e.message, /update the UKTextiles app/);
  assert.equal(e.message.includes('Two photos are required: please'), false, 'not the raw server wording');
});

test('other punch errors show the server\'s own message, else the local one, else a default', () => {
  assert.equal(describePunchError({ response: { data: { error: 'Outside the geofence' } } }).message, 'Outside the geofence');
  assert.equal(describePunchError({ message: 'Network Error' }).message, 'Network Error');
  assert.equal(describePunchError({}).message, 'Failed to submit punch');
  assert.equal(describePunchError(undefined).needsSecondPhoto, false);
});

// ------------------------------------------------------------------------------------------------ the capture slots

test('two photos: the tiles are "Photo 1 of 2" and "Photo 2 of 2", the first empty one is next, progress counts what is taken', () => {
  let plan = newPhotoPlan(2);
  assert.deepEqual(photoSlotViews(plan).map((s) => [s.label, s.uri, s.isNext]), [['Photo 1 of 2', null, true], ['Photo 2 of 2', null, false]]);
  assert.equal(photoProgressText(plan), '0 of 2 photos taken');
  plan = withPhoto(plan, 1, 'file:///two.jpg');
  assert.deepEqual(photoSlotViews(plan).map((s) => s.isNext), [true, false], 'the next one is the first EMPTY slot, even if a later one is filled');
  assert.equal(photoProgressText(plan), '1 of 2 photos taken');
  plan = withPhoto(plan, 0, 'file:///one.jpg');
  assert.equal(photoSlotViews(plan).some((s) => s.isNext), false);
  assert.equal(photoProgressText(plan), '2 of 2 photos taken');
  // retaking one keeps the other
  plan = withPhoto(plan, 0, 'file:///one-again.jpg');
  assert.deepEqual(plan.uris, ['file:///one-again.jpg', 'file:///two.jpg']);
});

test('one photo: the same component with a single plain "Photo" tile', () => {
  let plan = newPhotoPlan(1);
  assert.deepEqual(photoSlotViews(plan).map((s) => [s.label, s.isNext]), [['Photo', true]]);
  assert.equal(photoProgressText(plan), 'No photo yet');
  plan = withPhoto(plan, 0, 'file:///a.jpg');
  assert.equal(photoProgressText(plan), 'Photo taken');
});

test('the confirm button stays disabled until every slot is filled and the location is known, and says what is missing', () => {
  let plan = newPhotoPlan(2);
  assert.equal(confirmBlocker(plan, true), 'Take Photo 1 of 2 to continue');
  plan = withPhoto(plan, 0, 'file:///one.jpg');
  assert.equal(confirmBlocker(plan, true), 'Take Photo 2 of 2 to continue');
  plan = withPhoto(plan, 1, 'file:///two.jpg');
  assert.equal(confirmBlocker(plan, false), 'Waiting for your location');
  assert.equal(confirmBlocker(plan, true), null);
  assert.equal(confirmBlocker(newPhotoPlan(1), true), 'Take the photo to continue');
  // HR switches to two photos mid-capture: the photo already taken stays, the second slot appears and blocks again
  let one = withPhoto(newPhotoPlan(1), 0, 'file:///one.jpg');
  assert.equal(confirmBlocker(one, true), null);
  one = withRequired(one, 2);
  assert.deepEqual(one.uris, ['file:///one.jpg', null]);
  assert.equal(confirmBlocker(one, true), 'Take Photo 2 of 2 to continue');
});

// ------------------------------------------------------------------------------------------------ key case

test('src/lib/caseKeys: the two conversions the axios client applies', () => {
  assert.equal(snakeToCamel('device_id'), 'deviceId');
  assert.equal(camelToSnake('recordedAt'), 'recorded_at');
  assert.deepEqual(camelizeKeys({ ack_seq: 1, config: { sample_moving_seconds: 10 }, list: [{ track_id: 2 }] }), {
    ackSeq: 1, config: { sampleMovingSeconds: 10 }, list: [{ trackId: 2 }],
  });
  assert.deepEqual(decamelizeKeys({ deviceId: 'x', points: [{ isMocked: false }] }), { device_id: 'x', points: [{ is_mocked: false }] });
  const d = new Date(0);
  assert.equal(decamelizeKeys({ at: d }).at, d, 'dates are left alone');
  assert.equal(decamelizeKeys(null), null);
  assert.equal(decamelizeKeys('keepMe'), 'keepMe');
});
