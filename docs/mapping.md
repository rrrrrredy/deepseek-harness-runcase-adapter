# Mapping DeepSeek Harness to RunCase

The adapter records one SDK-owned activity interval: prompt receipt through the root session returning to idle, or until the SDK reports a transport failure or timeout.

| DeepSeek Harness evidence | RunCase field | Boundary |
|---|---|---|
| Prompt and SDK route | `goal`, `agent`, `configuration` | Configuration is recorded, not judged. |
| `session.event`, `session.status`, subagent notifications | `events` | Arrival time is added by the adapter. |
| SDK final response and turn-end reason | `extensions.deepseek_harness`, outcome summary | A response is evidence of output, not correctness. |
| SDK/transport failure | Run `status`, capture error | Partial notifications remain in order. |
| Patch file content | Configuration file digest | The adapter records a digest and safe display path, not file content. |

The output always declares partial capture because the pinned wire protocol does not give the adapter prompt-level causal IDs for every assistant event, complete artifact snapshots, hidden reasoning, or remote subagent completion.

Run lifecycle and task result are separate. A clean `completed` turn maps to Run `status: succeeded`; task `outcome.status` remains `unknown` until another system supplies objective verification.
