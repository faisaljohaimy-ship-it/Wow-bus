# BILTIX GPT assistant — 2026-11-25

## Scope and current status

The owner requested an implemented repair for deployment and GPT connectivity. This change adds a bounded,
single-question assistant to `#/engine` and a dependency-free Vercel Node function at `POST /api/assistant`.
It is a local release candidate. Neither a deployed function nor a successful live OpenAI request has been
observed. The interface must not claim otherwise.

The assistant is separate from the five simulated risk pipelines. It does not read the demo store, import
project records, change risk scores, trigger actions or turn any enterprise connector into a live connection.
The existing static frontend, bilingual dictionaries, status conventions and no-runtime-dependency rule remain.
This is an owner-access feature, not a multi-user identity system.

## Acceptance

| ID | Required behavior |
| --- | --- |
| GPT-01 | The engine view offers a bilingual prompt form; mounting the view sends no API request. |
| GPT-02 | Only an explicit submission sends `{prompt, lang}` to the same-origin function. No localStorage record or previous conversation is included. |
| GPT-03 | The server requires a separately configured BILTIX access token and keeps the OpenAI credential entirely server-side. Missing or invalid configuration fails closed. |
| GPT-04 | The token is transient while the view is open. No token, prompt or answer is saved to localStorage, sessionStorage or an offline cache. |
| GPT-05 | The function accepts only a bounded JSON POST, rejects foreign browser origins, caps model output and execution time, and uses a fixed OpenAI endpoint. |
| GPT-06 | API errors, refusals and incomplete responses have honest localized states. Upstream error bodies and credentials never reach the client or logs. |
| GPT-07 | The client prevents duplicate submissions and aborts pending work when leaving the view. All answer text uses safe DOM APIs. |
| GPT-08 | Offline caching explicitly bypasses `/api/` and authenticated requests, including any old cached responses. |
| GPT-09 | Dependency-free unit tests exercise auth, validation, privacy, timeout and upstream failure behavior with fake upstream responses. CI checks the engine view in AR/EN, dark/light, desktop/mobile. |
| GPT-10 | Before claiming a working live connection, configure the intended deployment, observe a successful authorized prompt, and verify that unauthorized requests never invoke OpenAI. |

## Server configuration

Configure these values only for the intended `biltix-risk-ai` deployment environment. None belongs in a
browser bundle, Git commit, chat message, static file, or the existing Settings → data-source key field.

| Environment variable | Meaning |
| --- | --- |
| `OPENAI_API_KEY` | A project credential provisioned through the secure OpenAI Platform setup flow. Never expose its value in logs or the UI. |
| `OPENAI_MODEL` | The exact Responses-compatible model ID authorized for the selected project. There is deliberately no assumed or silently substituted model. |
| `BILTIX_AI_ACCESS_TOKEN` | A separate unpredictable owner access secret, at least 32 characters, distributed privately to authorized users. It must never equal the OpenAI key. |

Environment changes require a new deployment. The function intentionally stays unavailable when these values
are absent. A ChatGPT subscription or a successful static deployment is not evidence of API configuration.
The access token can be rotated by replacing the server value and deploying again; existing browser tokens
then stop working. Do not use the existing data-source key field: that field belongs to the legacy demo's
local settings, not server secrets.

## Request and data handling

The function calls `https://api.openai.com/v1/responses` with the configured model, `store: false`, a bounded
`max_output_tokens`, a fixed application instruction and the submitted text. It exposes no tool calling,
web browsing, file access, arbitrary upstream URL, client-selected model or server-side actions.
`store: false` disables Responses application storage; it is not a claim that all provider retention is zero.

Only the current prompt is sent. A later question is a new request without implicit chat history.
Client and server responses use `no-store`. The service worker does not intercept API or authenticated
requests. The application does not intentionally log credentials, prompts, answers or upstream error bodies.

The owner access token is the authorization boundary. Per-request size, duration and output caps bound an
individual request, not total account spending. There is no distributed quota or per-user accounting in this
small integration. An exposed token must be rotated; broad multi-user access requires real authentication and
a durable quota system. Do not describe an in-process throttle, if added, as a global spend limit.

## Verification and release

Local verification completed on the v3.8.5 candidate: 227 tests passed, zero failed. The assistant-specific
set passed 28 tests (server, client and the client-to-handler contract) with mocked upstream responses.
Both generated-file checks passed after the `3.8.5+202611251556` stamp. These results do not establish
browser rendering, production publication or a successful live OpenAI connection.

- Run `node tests/run.mjs` and generated-file checks after the final stamp.
- Include `engine` in the CI browser matrix; static-page QA verifies the assistant can mount without a backend.
- Exercise real server calls only after secure configuration. No credentials were created or copied into this candidate.
- Verify success, invalid token and missing configuration in the intended deployment before calling the integration live.
- Keep historic simulated statuses, datasets and connectors unchanged.

Primary implementation references:

- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel runtime configuration](https://vercel.com/docs/functions/configuring-functions/runtime)
