# SpendPreflight for LangChain

Prepared integration package; not yet published on npm. We operate SpendPreflight. This package is MIT licensed and uses the actual LangChain tool interface.

```ts
import { createSpendPreflightTools } from '@spendpreflight/langchain';
// screeningFetch is your separately bounded x402-paying fetch for API screening fees.
const tools = createSpendPreflightTools(screeningFetch);
// Pass tools to your LangChain agent. Enforce holds/blocks in the payment client.
```

`check_payee` costs $0.01 and `preflight_payment` costs $0.02 USDC on Base. No SpendPreflight account, API key or OAuth. Your x402 client needs its own wallet authorization, kept outside the model. This package never sends requests to a merchant URL and never automatically retries a failed screen or authorizes a merchant payment. Transport, non-2xx and malformed response errors must hold payment. Successful hold/block/unknown results remain intact.

Preflight returns a signed decision; verify it using `verifyReceipt` from `spendpreflight` with separately trusted service keys. A signature proves the returned statement, not merchant identity or paid delivery. Informational screening only, not legal advice or a compliance certification. We store no caller request bodies; see https://api.spendpreflight.com/privacy. The caller controls its own logs.

Publishing gate: configure npm Trusted Publishing for `@spendpreflight/langchain`, GitHub repository `spendpreflight/spendpreflight-js`, workflow `publish-langchain.yml`. If npm requires first-package creation/passkey approval, Brad performs that owner step. Do not dispatch publishing before it is configured. SDK0.2.0 remains unchanged.
