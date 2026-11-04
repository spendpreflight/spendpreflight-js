# Remote MCP registry metadata

`.mcp/server.json` describes the hosted SpendPreflight endpoint and is published with the official `mcp-publisher` through the existing GitHub OIDC workflow. It is separate from the npm package version; metadata publication does not publish npm or build Actors.

Version `1.2.0-metadata.8` adds the existing branded SVG/256px PNG and this public repository link. This repository contains the SDK, MCP connection documentation and publishing manifest. It is not the source of the privately hosted Worker implementation.

The remote service retains its 17 production tools, prices and input validation. Input property descriptions clarify requiredness, formats, examples and units, including atomic quote strings versus decimal USDC receipt strings.

MCPtry's observed pre-upgrade score on November 4, 2026 was 85/100. The maintainer claim is handled separately by Brad. The README badge remains pending confirmation of that claim and the official badge snippet. The subsequent score is an observation after MCPtry's next crawl, not a promised outcome.
