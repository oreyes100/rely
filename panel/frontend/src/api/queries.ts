import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  Credential,
  HistoryEntry,
  NodeInfo,
  ProvisionRequest,
  ProvisionResult,
  Snapshot,
  Vm,
} from './types';

export function useNodes() {
  return useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<NodeInfo[]>('/nodes'),
    refetchInterval: 10_000,
  });
}

export function useVms() {
  return useQuery({
    queryKey: ['vms'],
    queryFn: () => api<Vm[]>('/vms'),
    refetchInterval: 5_000,
  });
}

export function useVmIp(node: string, vmid: number, enabled: boolean) {
  return useQuery({
    queryKey: ['vm-ip', node, vmid],
    queryFn: () => api<{ ip: string | null }>(`/vms/${node}/${vmid}/ip`),
    enabled,
    refetchInterval: (q) => (q.state.data?.ip ? false : 15_000),
  });
}

export function useProvision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ProvisionRequest) =>
      api<ProvisionResult>('/vms', { method: 'POST', body: JSON.stringify(req) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vms'] });
      qc.invalidateQueries({ queryKey: ['nodes'] });
      qc.invalidateQueries({ queryKey: ['credentials'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useVmAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ node, vmid, action }: { node: string; vmid: number; action: string }) =>
      api<{ ok: boolean }>(`/vms/${node}/${vmid}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['vms'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useVmDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api<{ ok: boolean }>(`/vms/${node}/${vmid}`, { method: 'DELETE' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['vms'] });
      qc.invalidateQueries({ queryKey: ['nodes'] });
      qc.invalidateQueries({ queryKey: ['credentials'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useSnapshots(node: string, vmid: number, enabled: boolean) {
  return useQuery({
    queryKey: ['snapshots', node, vmid],
    queryFn: () => api<Snapshot[]>(`/vms/${node}/${vmid}/snapshots`),
    enabled,
  });
}

export function useSnapshotAction(node: string, vmid: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['snapshots', node, vmid] });
    qc.invalidateQueries({ queryKey: ['history'] });
  };
  const create = useMutation({
    mutationFn: (name: string) =>
      api(`/vms/${node}/${vmid}/snapshots`, { method: 'POST', body: JSON.stringify({ name }) }),
    onSettled: invalidate,
  });
  const rollback = useMutation({
    mutationFn: (name: string) =>
      api(`/vms/${node}/${vmid}/snapshots/${name}/rollback`, { method: 'POST', body: '{}' }),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (name: string) => api(`/vms/${node}/${vmid}/snapshots/${name}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
  return { create, rollback, remove };
}

export function useCredentials() {
  return useQuery({
    queryKey: ['credentials'],
    queryFn: () => api<Credential[]>('/credentials'),
  });
}

export function useRegenerateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api<{ user: string; password: string; note: string }>(`/credentials/${node}/${vmid}/regenerate`, {
        method: 'POST',
        body: '{}',
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['credentials'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: () => api<HistoryEntry[]>('/history'),
    refetchInterval: 15_000,
  });
}
