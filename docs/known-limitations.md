# Known limitations

- DeepSeek Harness `0.1.2-alpha.2` is an upstream developer preview; its SDK wire identity is `0.0.1` and has no version negotiation.
- The adapter owns and records runs started through its CLI. It does not observe an already-running Harness process.
- The SDK does not bind every received event to one prompt with a causal identifier.
- Remote subagent finishes are not exposed by the pinned SDK notification contract.
- Files changed by the Agent are not enumerated by the SDK, so the adapter does not invent an artifact list.
- Hidden reasoning is unavailable and excluded by design.
- Task correctness remains unknown without an external verifier.
- Hosted CI covers a keyless SDK contract. It does not exercise a production account, physical Mac, Intel Mac, or model quality.
