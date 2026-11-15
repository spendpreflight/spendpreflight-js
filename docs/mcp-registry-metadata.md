# Remote MCP registry metadata

`.mcp/server.json` describes the hosted SpendPreflight endpoint and is published with the official `mcp-publisher` through the existing GitHub OIDC workflow. It is separate from the npm package version; metadata publication does not publish npm or build Actors.

Version `1.2.0-metadata.9` explicitly declares anonymous MCP connection/discovery in the registry's publisher-provided extension metadata. The official registry schema has no dedicated authentication-method field; this declaration does not add a required credential header. Connecting, `initialize` and `tools/list` need no account, API key, OAuth or Authorization header. Paid execution separately needs an approved x402 payment unless an existing free path or eligible trial applies. See the [connection guide](https://docs.spendpreflight.com/mcp/) and [public discovery card](https://api.spendpreflight.com/.well-known/mcp.json).

The existing branded SVG/256px PNG and public repository link are retained. This repository contains the SDK, MCP connection documentation and publishing manifest. It is not the source of the privately hosted Worker implementation.

The remote service retains its 17 production tools, prices and input validation. Input property descriptions clarify requiredness, formats, examples and units, including atomic quote strings versus decimal USDC receipt strings.

On November 15, 2026, [Agent Tools' public listing](https://agent-tools.cloud/mcp/servers/spendpreflight-api-spendpreflight-com) showed readiness B, 86/100, measured November 14. Authentication declaration was 0/5; identity was 7/10, freshness/modern flags 2/5 and negotiated protocol 8/10. The access declaration addresses an owned metadata omission. Directory ingestion and any later score are independently observed outcomes, not promised improvements. No directory claim, sign-in, forced scan or email reply is part of this metadata release; protocol negotiation and tools are unchanged.

MCPtry's observed pre-upgrade score on November 4, 2026 was 85/100. The maintainer claim is handled separately by Brad. The README badge remains pending confirmation of that claim and the official badge snippet. The subsequent score is an observation after MCPtry's next crawl, not a promised outcome.
