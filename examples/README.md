# Framework examples

Maintained by the operator of SpendPreflight. These examples use the agent's existing wallet/fetch and require no SpendPreflight account, API key or OAuth. Screening is informational, not legal advice or a compliance certification.

| Example | Purpose | Install in your agent app |
|---|---|---|
| [Vercel AI SDK](./vercel-ai-sdk.ts) | A tool posts the merchant's complete 402 challenge and rules to `/v1/preflight` ($0.02, Base USDC), returning allow/hold/block with a receipt. | `npm i ai zod` |
| [LangChain JS](./langchain.ts) | `check_payee` calls the HTTP screening endpoint ($0.01, Base USDC), with wallet/name/domain inputs. | `npm i @langchain/core zod` |
| [OpenAI Agents SDK](./openai-agents.ts) | A real SDK function tool requests preflight ($0.02), preserves hold/block and propagates errors. No model call is made by the factory. | `npm i @openai/agents zod` |
| [x402 fetch + guard](./x402-fetch.ts) | Enforces local spending rules before signing any merchant payment; denies hold/block by default. | `npm i spendpreflight @x402/core @x402/fetch @x402/evm viem` |

Copy the relevant file into your app, then import its exported factory. For the first two examples, supply your existing `wrapFetchWithPayment(fetch, client)` as `screeningFetch`. That client pays the disclosed screening fee; the reviewed merchant payment is separate. An HTTP 402 from plain fetch means payment is required, not that screening succeeded. Optional trial access is limited to three shared HTTP/MCP calls per day per IP.

A model choosing to call a tool is **not** a payment gate. Apply `guard()` to the actual payment client, and handle holds through an explicit human/policy decision. Keep real private keys in your application's secret storage. These examples do not read project credentials and never execute on import.

From this repository: `npm ci`, `npm run build`, `npm test`, `npm run typecheck:examples`. Tests use local HTTP mocks and throwaway signers; they make no live request, paid call or LLM call.

Official references: [AI SDK tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), [LangChain tools](https://docs.langchain.com/oss/javascript/langchain/tools), [OpenAI Agents tools](https://openai.github.io/openai-agents-js/guides/tools/), [x402 buyer quickstart](https://docs.x402.org/getting-started/quickstart-for-buyers).
