/** Compatibility entry point; the additive installer preserves all LAN peers. */
process.argv.push('--only=gz,jp');
await import('./onboard-managed-servers.mjs');
