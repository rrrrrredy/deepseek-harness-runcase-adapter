# Security policy

## Supported version

Security fixes are provided for the latest released preview only.

## Reporting

Please use GitHub's private security advisory flow for this repository. Do not open a public issue containing credentials, captured prompts, private paths, or unredacted RunCase files.

## Data boundary

The CLI writes only to user-selected output paths, starts the pinned DeepSeek Harness child process for the requested run, and then closes it. It does not start a background service or upload records. Common secrets and selected paths are redacted before output, but users should still inspect records before sharing them.

API keys belong in environment variables or private Harness configuration. Command-line API-key flags are intentionally unsupported.
