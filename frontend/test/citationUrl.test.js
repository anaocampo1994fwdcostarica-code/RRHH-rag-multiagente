import assert from 'node:assert/strict'
import test from 'node:test'
import { isSafeCitationUrl } from '../src/features/chat/citationUrl.js'

test('accepts only HTTPS Google Drive citation URLs', () => {
  assert.equal(isSafeCitationUrl('https://drive.google.com/open?id=abc_123'), true)
  assert.equal(isSafeCitationUrl('http://drive.google.com/open?id=abc'), false)
  assert.equal(isSafeCitationUrl('https://example.test/document'), false)
  assert.equal(isSafeCitationUrl('javascript:alert(1)'), false)
  assert.equal(isSafeCitationUrl(null), false)
})
