import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmbedding, embeddingsEnabled } from './embeddingClient.js';

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = undefined;
});

test('uses OpenRouter embedding API when OpenAI key is missing', async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.OPENROUTER_API_KEY = 'router-key';

  let called = false;
  global.fetch = async (url, options) => {
    called = true;
    assert.equal(url, 'https://openrouter.ai/api/v1/embeddings');
    assert.equal(options.headers.Authorization, 'Bearer router-key');
    return {
      ok: true,
      json: async () => ({
        data: [
          { embedding: [0.1, 0.2, 0.3] },
        ],
      }),
    };
  };

  const enabled = embeddingsEnabled();
  assert.equal(enabled, true);

  const result = await getEmbedding('hello world');
  assert.equal(called, true);
  assert.deepEqual(result, [0.1, 0.2, 0.3]);
});

test('returns null when no embedding key is configured', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  const enabled = embeddingsEnabled();
  assert.equal(enabled, false);

  const result = await getEmbedding('hello world');
  assert.equal(result, null);
});
