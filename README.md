# SUSFS Studio

SUSFS Studio is an offline WebUI for device diagnostics and Studio-owned configuration archives. The standalone browser preview uses simulated diagnostic data and supports local JSON previews. Hosts with a compatible command bridge can read diagnostics; hosts that also provide the verified version-1 file stream can save, refresh, and export a private Studio archive. Archive storage does not apply SUSFS rules. Each host version requires separate validation.

## Browser preview

Use Node.js 22.12 or later and pnpm 12.21.0. From the repository root, run the following commands.

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev --host 127.0.0.1 --port 5176 --strictPort
```

Open [SUSFS Studio](http://127.0.0.1:5176/#/).

## Documentation

- [User guide](docs/user-guide.md) covers diagnostic states, local archive previews, and browser preferences.
- [Archive format](docs/archive-format.md) defines version-1 validation, comparison, private storage, receipts, and export behavior.
- [WebUI maintenance guide](docs/webui-maintenance.md) covers routing, source ownership, and verification.
- [Diagnostic CLI](docs/diagnostic-cli.md) describes the experimental read-only Android executable and its build commands.
- [Host integration](docs/host-integration.md) records the verified bridge boundary and remaining host requirements.
- [Design specification](DESIGN.md) defines tokens and visual requirements.
