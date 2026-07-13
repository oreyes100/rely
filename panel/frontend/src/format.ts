export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatUptime(seconds?: number): string {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
}

export function pct(used?: number, total?: number): number {
  if (!used || !total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}
