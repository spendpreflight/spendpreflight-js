# Restricted-run channel repair

A public Store Actor can have private run metadata. An anonymous metadata request for our own startup self-test returned 403 insufficient-permissions; the old channel therefore could not establish authorization. Store publication is not live result delivery proof.

The new protocol signs the operation, raw-input digest, run/build identities, short-lived timestamp, mode and nonce with a distinct Ed25519 application key for each official Actor. The backend holds public keys only and checks public Actor/latest-build metadata plus the live, one-use container proof. It never requests private run metadata. Old unsigned requests fail closed.

Use the dispatch-only Apify private-run channel repair workflow on tested main. Prepare requires an exact existing build map and creates only missing encrypted runtime application keys. Private keys exist only in runner memory and the Actor encrypted runtime setting; runtime variables are excluded from Docker builds. Artifacts contain public keys and sanitized receipts only. Partial/unknown key or build intents require inspection, never blind rotation, rebuild or redispatch. No customer or owner API token leaves Apify or CI. Account permissions, run/store/log access and prices are unchanged.

After public keys are deployed to the Worker, repair requires those same exact old build IDs, uploads the fixed wrapper sources, creates one new build and one authentication-only platform run per selected Actor. The run proves the signed backend handshake but performs no product engine, target/chain lookup, output dataset write or charged event. It is operator work, not adoption/revenue or paid-result acceptance. Preserve every old build and failed/unknown outcome.

The existing Store support terms apply to all five Actors: actual issues within 14 calendar days and actual Apify requests within three business days, on the same existing heartbeat. No new automation, terms, scopes, account or security settings are authorized by this repair.
