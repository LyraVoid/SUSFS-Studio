# SUSFS Studio

SUSFS Studio is an independent SUSFS management WebUI for KSU hosts. It reports the device provider and operation eligibility without requiring a manager's built-in SUSFS dashboard. Studio maintains its own versioned archive, resolves the archive into a provider-qualified operation plan, writes a per-item journal, applies supported operations, and verifies effects independently. Paths, maps, dynamic and static kstat, redirects, tri-state settings, uname, cmdline/bootconfig, LKM module hiding, mount prefixes, and Studio-owned boot stages use the same transaction.

The standalone browser preview uses simulated diagnostic data and local JSON previews. Hosts with a compatible command bridge can read diagnostics and use Studio's archive and operation protocol; hosts that also provide the verified version-1 file stream can save, restore, refresh, and export the private archive. A Provider feature marker, archive receipt, syscall acknowledgement, or loaded module is never treated as proof of effect. Each host and Provider combination requires separate validation. Studio does not call FinaSU's `ksud susfs` controller, sidex15's `ksu_susfs`, or alter the host manager.

## Browser preview

Use Node.js 22.12 or later and pnpm 12.21.0. From the repository root, run the following commands.

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev --host 127.0.0.1 --port 5176 --strictPort
```

Open [SUSFS Studio](http://127.0.0.1:5176/#/).

## Documentation

- [User guide](docs/user-guide.md) covers diagnostic states, local archive previews, and browser preferences.
- [Archive format](docs/archive-format.md) defines schema validation, comparison, configuration exchange, private storage, receipts, and export behavior.
- [WebUI maintenance guide](docs/webui-maintenance.md) covers routing, source ownership, and verification.
- [Diagnostic CLI](docs/diagnostic-cli.md) describes the Android executable, archive transaction, operation commands, and build commands.
- [Module releases](docs/releases.md) documents manual release and debug builds, version metadata, and module updates.
- [Host integration](docs/host-integration.md) records the verified bridge boundary and remaining host requirements.
- [Security model](docs/security-model.md) defines trust boundaries, threats, limits, and fail-closed behavior.
- [Design specification](DESIGN.md) defines tokens and visual requirements.
