export interface NodeInfo {
  name: string;
  host: string;
  subnet: string;
  vmidRange?: [number, number];
  nodeType?: 'proxmox' | 'hyperv';
  online: boolean;
  cpu?: number; // fracción 0-1
  maxCpu?: number;
  loadavg?: string[];
  memUsed?: number;
  memTotal?: number;
  storUsed?: number;
  storTotal?: number;
  storAvail?: number;
  storBulkAvail?: number;
  uptime?: number;
  templateReady?: boolean;
  error?: string;
}

export interface Vm {
  node: string;
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | string;
  cpus: number;
  cpu: number;
  mem: number;
  maxmem: number;
  maxdisk: number;
  uptime: number;
  tags: string[];
}

export interface ProvisionRequest {
  node: string;
  hostname: string;
  cores: number;
  memoryMb: number;
  diskGb: number;
  dataDiskGb?: number;
  tags: string[];
}

export interface ProvisionResult {
  node: string;
  vmid: number;
  hostname: string;
  user: string;
  password: string;
  subnetHint: string;
}

export interface Credential {
  node: string;
  vmid: number;
  hostname: string;
  user: string;
  password: string | null;
  createdAt: string;
  rotatedAt?: string;
}

export interface HistoryEntry {
  ts: string;
  action: string;
  node: string;
  vmid?: number;
  detail: string;
  ok: boolean;
  user: string;
}

export interface Snapshot {
  name: string;
  snaptime?: number;
  description?: string;
}

// ── Portal de cliente ─────────────────────────────────────────────────────────
export interface PasoPortal {
  etiqueta: string;
  estado: 'listo' | 'en progreso' | 'error' | 'pendiente';
  mensaje?: string;
}

export interface DbInfo {
  tipo: string;
  usuario?: string;
  password?: string;
  nombre?: string;
  urlConexion?: string;
  nota?: string;
}

export interface ProyectoPortal {
  id: string;
  nombre: string;
  url: string;
  plan: string;
  estado: 'activo' | 'en progreso' | 'error' | 'eliminado';
  pasos: PasoPortal[];
  db: DbInfo | null;
  creadoEl: string;
}

export interface ClienteMe {
  name: string;
  email: string;
  quota: number;
  createdAt: string;
}
