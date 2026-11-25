/** Browser request adapter → deployed handler contract, with an inert OpenAI stub. No network or secrets. */
import assert from 'node:assert/strict';
import { requestAssistant } from '../js/ui/gpt-assistant.js';
import { createHandler } from '../api/assistant.mjs';

const ORIGIN = 'https://biltix-risk-ai.vercel.app';
const ACCESS = 'fixture_biltix_owner_access_0123456789';

export const tests = [{
  name: 'assistant browser client and server agree on a real Request/Response exchange and deny unauthorized upstream use',
  async fn() {
    let upstreamCalls = 0;
    const handler = createHandler({
      getEnv: () => ({
        OPENAI_API_KEY: 'sk-fixture-not-a-real-credential',
        OPENAI_MODEL: 'fixture-model',
        BILTIX_AI_ACCESS_TOKEN: ACCESS,
      }),
      fetchImpl: async (_url, options) => {
        upstreamCalls += 1;
        const body = JSON.parse(options.body);
        assert.equal(body.input, 'راجع هذا الافتراض.');
        assert.equal(body.store, false);
        return Response.json({ status: 'completed', output: [{
          type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'هذا رد اختبار محلي فقط.' }],
        }] });
      },
    });
    const fetchImpl = (path, options) => {
      assert.equal(path, '/api/assistant');
      return handler(new Request(`${ORIGIN}${path}`, {
        ...options,
        headers: { ...options.headers, Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' },
      }));
    };
    const answer = await requestAssistant({ prompt: 'راجع هذا الافتراض.', lang: 'ar', token: ACCESS }, { fetchImpl });
    assert.deepEqual(answer, { text: 'هذا رد اختبار محلي فقط.', status: 'live', model: 'fixture-model' });
    assert.equal(upstreamCalls, 1);
    await assert.rejects(
      requestAssistant({ prompt: 'راجع هذا الافتراض.', lang: 'ar', token: 'another_fixture_owner_access_0123456789' }, { fetchImpl }),
      (error) => error.code === 'UNAUTHORIZED',
    );
    assert.equal(upstreamCalls, 1, 'invalid access token never reaches the upstream');
  },
}];
