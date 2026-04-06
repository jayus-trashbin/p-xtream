import { getBuiltinSources } from '@/entrypoint/providers';
import { checkProviderHealth, ProviderHealthResult } from '@/health';

const STATUS_ICON: Record<ProviderHealthResult['status'], string> = {
  healthy: '✅',
  degraded: '⚠️ ',
  down: '❌',
};

async function main() {
  const sources = getBuiltinSources().filter((s) => !s.disabled);
  console.log(`\nChecking ${sources.length} providers...\n`);

  const results = await Promise.allSettled(sources.map((s) => checkProviderHealth(s)));

  let healthy = 0;
  let degraded = 0;
  let down = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { name, status, latencyMs, error } = result.value;
      const icon = STATUS_ICON[status];
      const latency = latencyMs != null ? `${latencyMs}ms` : '—';
      const errorNote = error ? `  ← ${error}` : '';
      console.log(`  ${icon} ${name.padEnd(32)} ${status.padEnd(10)} ${latency.padStart(6)}${errorNote}`);

      if (status === 'healthy') healthy++;
      else if (status === 'degraded') degraded++;
      else down++;
    } else {
      console.log(`  ❓ (unknown)  — rejected: ${result.reason}`);
      down++;
    }
  }

  console.log(`\nSummary: ${healthy} healthy, ${degraded} degraded, ${down} down\n`);

  // Exit with error code if all providers are down
  if (down === sources.length && sources.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Health check failed:', err);
  process.exit(1);
});
