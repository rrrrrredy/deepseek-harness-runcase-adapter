# Upstream compatibility

This is an independent community adapter. It is not an official DeepSeek product and does not modify or redistribute DeepSeek Harness under another name.

Version 0.1.0 pins the official npm packages `@deepseek-ai/dsh-sdk-client@0.1.2-alpha.2` and its exact same-version `@deepseek-ai/dsh` runtime. The corresponding official tag is `dsh-v0.1.2-alpha.2` at commit `0a53fb55bea101816fa226bb964ae2bed71c343b`. Exact npm integrity values and the observed wire identity live in `upstream.json` and `package-lock.json`.

DeepSeek Harness describes this line as a developer preview. Its SDK handshake has no protocol-version negotiation, and the advertised wire version remains `0.0.1`. A future Harness update is accepted only after the keyless fake-runtime contract, platform CI, a recorded fixture, and the mapping limitations are reviewed together.
