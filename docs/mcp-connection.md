# SpendPreflight MCP connection

We operate SpendPreflight. This repository includes a public connection component for our hosted remote MCP service; it does not contain the private Worker server source. It is suitable for directory intake that accepts remote connection configurations. No marketplace acceptance or tested desktop installation is claimed.

The root `.mcp.json` is detected by [Cursor Directory's documented intake](https://github.com/cursor/community-plugins#submit-a-plugin). Review it before adding the remote server in your MCP client. Clients with a different config format can use the same HTTPS URL: `https://api.spendpreflight.com/mcp`. No local command runs, no wallet is loaded and no account, API key, OAuth token or environment variable is required from the caller.

Production tools are `get_service_info`, `check_payee`, `preflight_payment` and `check_endpoint`. Scout `find_endpoint` and `verify_endpoint` remain staging previews and are not advertised as production tools.

`get_service_info` is free. Screening shares three free trials per IP per UTC day with HTTP; exhaustion returns payment-required and never authorizes a payment automatically. Paid check/preflight/endpoint calls are $0.01/$0.02/$0.005 in Base USDC. Cached endpoint checks require available index evidence; missing coverage is unknown. Generic MCP clients may need a compatible x402 payment extension to make paid calls. This connection does not supply one or sign payments.

Keep private keys and payment authority outside the model's tools. A screening tool is advisory unless an application guard enforces hold/block in the actual signing path. Informational screening is not legal advice, identity verification, a compliance certification or a guarantee of paid delivery. See [privacy](https://api.spendpreflight.com/privacy) and [trust](https://spendpreflight.com/trust.html) before sending payee data.

Listing operator disclosure: **Operated by SpendPreflight: accountless x402 payee screening and spending preflight for agents, with signed decisions and a shared free trial.**
