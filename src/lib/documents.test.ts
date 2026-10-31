// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cacheFileName,
  describeFileError,
  NO_VIEWER,
  extensionOf,
  fileKind,
  folderLabel,
  groupByCategory,
  isPreviewableImage,
  kindLabel,
  latestUpload,
  mimeTypeFor,
  resolveActiveCategory,
  safeFileName,
  shortDate,
  type DocumentLike,
} from './documents.ts'

function doc(id: number, over: Partial<DocumentLike> = {}): DocumentLike {
  return {
    id,
    category: 'pan_card',
    categoryLabel: 'PAN Card',
    originalFilename: `file-${id}.pdf`,
    uploadedAt: `2026-0${(id % 9) + 1}-10T10:00:00Z`,
    ...over,
  }
}

test('extension and kind are read from the file name, case-insensitively', () => {
  assert.equal(extensionOf('Offer Letter.PDF'), 'pdf')
  assert.equal(extensionOf('archive.tar.gz'), 'gz')
  assert.equal(extensionOf('noextension'), '')
  assert.equal(extensionOf('.hidden'), '')
  assert.equal(extensionOf('trailingdot.'), '')
  assert.equal(extensionOf(null), '')
  assert.equal(fileKind('scan.JPG'), 'image')
  assert.equal(fileKind('a.pdf'), 'pdf')
  assert.equal(fileKind('a.docx'), 'word')
  assert.equal(fileKind('a.xlsx'), 'sheet')
  assert.equal(fileKind('a.zip'), 'other')
  assert.equal(kindLabel('image'), 'Photo')
})

test('only images the app can draw itself open in the in-app viewer', () => {
  assert.equal(isPreviewableImage('aadhaar.jpeg'), true)
  assert.equal(isPreviewableImage('aadhaar.png'), true)
  assert.equal(isPreviewableImage('photo.heic'), false)
  assert.equal(isPreviewableImage('letter.pdf'), false)
})

test('mime types for opening/sharing', () => {
  assert.equal(mimeTypeFor('x.pdf'), 'application/pdf')
  assert.equal(mimeTypeFor('x.JPG'), 'image/jpeg')
  assert.equal(mimeTypeFor('x.unknown'), 'application/octet-stream')
  assert.equal(mimeTypeFor(undefined), 'application/octet-stream')
})

test('HR-typed names become safe file names that keep their extension', () => {
  assert.equal(safeFileName('PAN card.pdf'), 'PAN card.pdf')
  assert.equal(safeFileName('../../etc/passwd.pdf'), 'etc_passwd.pdf')
  assert.equal(safeFileName('a/b\\c:d*e?.PDF'), 'a_b_c_d_e_.pdf')
  assert.equal(safeFileName('   '), 'document')
  assert.equal(safeFileName('.pdf'), 'pdf') // a leading dot would hide the file
  assert.equal(safeFileName('report'), 'report')
  assert.equal(safeFileName('x'.repeat(200) + '.pdf').length, 84)
  assert.equal(safeFileName(null, 'file'), 'file')
  assert.ok(!safeFileName('bad\u0000name.pdf').includes('\u0000'))
})

test('the temporary copy is unique per document id, so the same name never collides', () => {
  const a = cacheFileName({ id: 4, originalFilename: 'scan.pdf' })
  const b = cacheFileName({ id: 9, originalFilename: 'scan.pdf' })
  assert.equal(a, 'doc-4-scan.pdf')
  assert.notEqual(a, b)
  assert.equal(cacheFileName({ id: 1, originalFilename: '../x.png' }), 'doc-1-x.png')
})

test('grouping keeps category order and lists the newest upload first', () => {
  const docs = [
    doc(1, { uploadedAt: '2026-01-01T00:00:00Z' }),
    doc(2, { category: 'aadhaar_card', categoryLabel: 'Aadhaar Card' }),
    doc(3, { uploadedAt: '2026-05-01T00:00:00Z' }),
    doc(4, { uploadedAt: null }),
  ]
  const groups = groupByCategory(docs)
  assert.deepEqual(groups.map((g) => g.category), ['pan_card', 'aadhaar_card'])
  assert.deepEqual(groups[0].files.map((f) => f.id), [3, 1, 4])
  assert.deepEqual(groupByCategory(null), [])
  assert.equal(groupByCategory([doc(5, { category: '', categoryLabel: '' })])[0].categoryLabel, 'Other')
})

test('a filter whose category vanished after a refresh falls back to All', () => {
  const groups = [{ category: 'pan_card' }, { category: 'offer_letter' }]
  assert.equal(resolveActiveCategory('pan_card', groups), 'pan_card')
  assert.equal(resolveActiveCategory('bank_passbook', groups), null)
  assert.equal(resolveActiveCategory(null, groups), null)
  assert.equal(resolveActiveCategory('pan_card', []), null)
})

test('latest upload date', () => {
  assert.equal(latestUpload([doc(1, { uploadedAt: '2026-01-01T00:00:00Z' }), doc(2, { uploadedAt: '2026-03-01T00:00:00Z' })]), '2026-03-01T00:00:00Z')
  assert.equal(latestUpload([]), null)
})

test('folder names for "Saved to …"', () => {
  assert.equal(folderLabel('content://com.android.externalstorage.documents/tree/primary%3ADownload'), 'Download')
  assert.equal(folderLabel('content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FHR'), 'HR')
  assert.equal(folderLabel('content://com.android.externalstorage.documents/tree/primary%3A'), 'your phone storage')
  assert.equal(folderLabel('file:///storage/emulated/0/Download/'), 'Download')
  assert.equal(folderLabel(null), 'the folder you chose')
})

test('file errors are explained in plain words', () => {
  assert.equal(describeFileError(new Error(NO_VIEWER)).title, 'No app to open this file')
  assert.equal(describeFileError(new Error('UnableToDownload: status 404')).title, 'File not found')
  assert.equal(describeFileError(new Error('Unable to download, response code: 403')).title, 'Not allowed')
  assert.equal(describeFileError(new Error('No space left on device')).title, 'Not enough space')
  assert.equal(describeFileError(new Error('timeout')).title, 'Couldn’t get the file')
  assert.equal(describeFileError(undefined).title, 'Couldn’t get the file')
  // a 4-digit number that merely contains 404 is not a 404
  assert.equal(describeFileError(new Error('error 14045')).title, 'Couldn’t get the file')
})

test('short dates', () => {
  assert.equal(shortDate('2026-03-12T10:00:00'), '12 Mar 2026')
  assert.equal(shortDate(null), '')
  assert.equal(shortDate('nope'), '')
})
