# War-game: pvelenovo disk optimization — two-tier storage (SSD fast / 1TB bulk) + VM 104 off the SSD
> Executor: run moves in order. Read each move's failure signals before acting; check abort conditions after EVERY move. Phase 1 is confirmed and destructive by design (the 1TB gets wiped — user has backed up F:). Phase 2 is OPTIONAL and must not be started without the user picking an option. The disk-identity check (Move 1 / Move 4) is mandatory: wiping the wrong disk destroys pvelenovo.

## Mission objective
Rework storage on Proxmox node **pvelenovo** (192.168.1.15) into a two-tier layout:
- **FAST tier** = 240GB boot SSD → keep `local-lvm` as the fast pool for VM OS/boot disks, templates, scratch.
- **BULK tier** = 1TB SATA `/dev/sdb` → new LVM-thin pool `hdd1tb` for large data disks and heavy VMs.

Immediate outcome (Phase 1): the near-full SSD pool (8.6GB free) is rescued by moving VM 104 "aulamedios" entirely to `hdd1tb`; the old F: is wiped (user confirmed backed up) and recreated as a **400GB** NTFS drive on `hdd1tb`.

**Success (Phase 1) =** `local-lvm` avail returns to ~140GB+ free; `hdd1tb` (~900GB) exists and is node-wide storage usable by any VM; VM 104 boots Windows Server 2016 normally; a fresh 400GB F: is present; `/dev/sda` (boot SSD) and node **pve** untouched.

## Confirmed inputs
- **F: data:** disposable — user has backed everything up. → Branch **WIPE** (whole 1TB reused).
- **New F: size:** **400GB**.
- **Tiering intent:** SSD accelerates systems; the majority of stored data lives on the 1TB SATA.

## Recon summary (live from pvelenovo API, 2026-07)
- **Boot SSD** `/dev/sda` — 240GB ADATA SU630, GPT, "BIOS boot". Hosts VG `pve` and the `pve/data` LVM-thin pool. **NEVER write to /dev/sda.**
- **`local-lvm` (pve/data)** — total **155.5GB**, used **146.9GB**, avail **8.6GB** (94% full). The crunch being solved.
- **Target disk** `/dev/sdb` — 1000.2GB Seagate **ST1000NM0033-9ZM173** (7200rpm enterprise SATA), serial **Z1W5RS…**, GPT, one NTFS partition labelled `1Tb`; currently raw-passthrough to VM 104 as `sata3` via `/dev/disk/by-id/ata-ST1000NM0033-9ZM173_Z1W5RSSR`.
- **VM 104 "aulamedios"** (Win Server 2016, SeaBIOS, i440fx), disks:
  - `sata0` local-lvm **137G config / 147.1GB allocated** — Windows OS (the space hog; sole reason the pool is full).
  - `sata1` local-lvm **64M** — System Reserved (MBR bootloader + BCD; boots FIRST).
  - `sata2` local-lvm **512M** — recovery/aux.
  - `sata3` — raw passthrough of `/dev/sdb` (old F:).
  - `ide0` — virtio-win.iso cdrom.
  - `unused0/1/2/3/5/8` — near-empty (0–0.5GB) leftovers from prior disk-copy work.
  - Boot order `sata1;sata0` — must survive the moves.
- **Execution surface:** pvelenovo GUI → node `pvelenovo` → **Shell** = root prompt, no extra password (uses the root@pam web session). All CLI runs there; GUI equivalents noted. (If driving the console via browser automation, type into the xterm directly — programmatic JS injection into the terminal iframe did not reach the shell in testing; the API read calls do work.)
- **Why VM 104 can't stay/return to SSD as-is:** its OS disk is 147GB but the SSD pool is only 155GB usable — no headroom for it plus anything else. Hence VM 104 goes to bulk in Phase 1; Phase 2 offers ways to give it SSD speed.
- **Scope guard:** production panel = VM 210 on node **pve** (192.168.1.34), a different node. This mission touches only pvelenovo `/dev/sdb` and VM 104. Do not run anything against node pve or /dev/sda.

## Target architecture (the "scheme")
Role-based two-tier placement, applied going forward:

| Tier | Device | Storage id | Holds | Rationale |
|------|--------|-----------|-------|-----------|
| FAST | 240GB SSD | `local-lvm` | VM OS/boot disks (small), templates, clone sources, scratch | Random-IO/boot speed where it's felt |
| BULK | 1TB SATA | `hdd1tb` (new) | Large data disks, 400GB F:, heavy/legacy VMs (incl. 104) | Cheap capacity; "majority of data" |

Standing rule for every future VM/VPS: **small OS disk on `local-lvm` + large data disk on `hdd1tb`.** That is how the SSD "speeds up systems" without ever filling — saleable VPS get SSD OS disks; their bulk sits on the 1TB.

---

## PHASE 1 — Rescue the SSD, build the bulk tier, rebuild F: (confirmed)

### Move 1: Root shell + authoritative baseline
- **Action:** node pvelenovo → Shell. Record:
  - `lsblk -o NAME,SIZE,MODEL,SERIAL,FSTYPE,MOUNTPOINT`
  - `sgdisk -p /dev/sdb ; blkid /dev/sdb1`
  - `pvs ; vgs ; lvs ; pvesm status`
  - `qm config 104`
- **Expected if worked:** `/dev/sdb` = ST1000NM0033, SERIAL Z1W5RS…, one `ntfs` `sdb1`; `pvesm status` shows local-lvm ~8GB free.
- **Expected if failed:** sdb missing or a different disk under that letter.
- **Most likely cause:** disk re-lettering after reboot; passthrough still holding sdb.
- **Countermove:** always target the disk by stable id `/dev/disk/by-id/ata-ST1000NM0033-9ZM173_Z1W5RSSR`, not `/dev/sdb`, from here on.
- **Downstream:** confirms the device identity used by every destructive command below.

### Move 2: Stop VM 104 and release the passthrough
- **Action:** `qm shutdown 104 --timeout 90` (fallback `qm stop 104`); confirm `qm status 104` = stopped. Then `qm set 104 --delete sata3`.
- **Expected if worked:** status stopped; `qm config 104` no longer lists sata3; `fuser /dev/sdb` and `lsof /dev/sdb` return nothing.
- **Expected if failed:** shutdown hangs, or "disk in use" on delete.
- **Most likely cause:** no guest agent → slow ACPI shutdown.
- **Countermove:** hard `qm stop 104`; re-check `grep -l 'ST1000NM0033\|/dev/sdb' /etc/pve/qemu-server/*.conf` is empty.
- **Downstream:** sdb must be fully free before wipe.

### Move 3: Safety net before anything irreversible
- **Action:** the SSD pool is nearly full, so a full local backup may not fit. At minimum, dump VM 104's config: `qm config 104 > /root/vm104.conf.bak`. If any external target exists (node pve, an NFS/USB), take `vzdump 104` there. Note the current boot order string.
- **Expected if worked:** config saved; boot order recorded (`order=sata1;sata0`).
- **Expected if failed:** no space / no target for vzdump.
- **Most likely cause:** full SSD, no external store.
- **Countermove:** proceed on the user's acknowledgement that only a config-level backup exists; `qm disk move` (Move 5) copies-then-deletes, so a botched move of the tiny System Reserved is the real risk — verify boot BEFORE cleanup (Move 8) rather than after.
- **Downstream:** gates how recoverable Moves 4–6 are.

### Move 4: Wipe /dev/sdb and create the `hdd1tb` thin pool
- **Action:** re-verify identity FIRST: `lsblk -o NAME,SIZE,MODEL,SERIAL /dev/sdb` must show ST1000NM0033 / Z1W5RS. Then:
  - GUI (simplest): node pvelenovo → Disks → LVM-Thin → Create; Disk `/dev/sdb`, Name `hdd1tb`. (Wipes + PV/VG/thin-pool + registers storage in one action.)
  - CLI equivalent: `wipefs -a /dev/sdb && sgdisk -Z /dev/sdb && pvcreate /dev/sdb && vgcreate hdd1tb /dev/sdb && lvcreate --type thin-pool -l 95%FREE -n data hdd1tb && pvesm add lvmthin hdd1tb --vgname hdd1tb --thinpool data --content images,rootdir`
  - `wipefs -a /dev/sdb` is the **point of no return** (destroys old F: — confirmed OK).
- **Expected if worked:** `pvesm status` lists `hdd1tb` ~900GB, ~0 used, node-wide.
- **Expected if failed:** "excluded by a filter" / "device in use".
- **Most likely cause:** residual signatures or passthrough not released.
- **Countermove:** `wipefs -a /dev/sdb; sgdisk -Z /dev/sdb; partprobe /dev/sdb` then retry; confirm Move 2 removed sata3.
- **Downstream:** bulk tier now exists.

### Move 5: Move VM 104 off the SSD onto `hdd1tb`
- **Action:** big disk first: `qm disk move 104 sata0 hdd1tb`; then `qm disk move 104 sata1 hdd1tb`; then `qm disk move 104 sata2 hdd1tb`. (GUI: Hardware → disk → Disk Action → Move Storage → `hdd1tb`, tick Delete source.)
- **Expected if worked:** each ends "Successfully moved"; source auto-removed; after sata0 `pvesm status` shows local-lvm avail jump to ~140GB+; `qm config 104` shows sata0/1/2 on hdd1tb, same interface names, boot order unchanged.
- **Expected if failed:** "no space" on hdd1tb or a move stalls.
- **Most likely cause:** interrupted move; pool metadata sizing.
- **Countermove:** ensure hdd1tb free ≥ 160GB before starting; re-run a half-done move (idempotent per disk); never hand-delete a source.
- **Downstream:** SSD rescued; do NOT clean up until boot verified (Move 8).

### Move 6: Recreate the 400GB F:
- **Action:** `qm set 104 --sata3 hdd1tb:400` (GUI: Hardware → Add → Hard Disk, Bus SATA 3, Storage hdd1tb, Size 400).
- **Expected if worked:** `qm config 104` shows `sata3: hdd1tb:vm-104-disk-N,size=400G`.
- **Expected if failed:** insufficient free on hdd1tb.
- **Most likely cause:** space math (OS 147 + F: 400 within ~900 — fine; thin pool over-commits anyway).
- **Countermove:** reduce size or rely on thin provisioning.
- **Downstream:** formatted NTFS inside Windows in Move 9.

### Move 7: Confirm boot order
- **Action:** `qm config 104` must show `boot: order=sata1;sata0`; re-set if disturbed: `qm set 104 --boot "order=sata1;sata0"`.
- **Expected if worked:** order intact (System Reserved → OS).
- **Countermove:** re-assert the order; verify sata1 and sata0 both on hdd1tb.

### Move 8: Boot and verify BEFORE cleanup
- **Action:** `qm start 104`; open console.
- **Expected if worked:** Windows Server 2016 boots to lock screen as before (no 0xc000000f, no "no bootable device").
- **Expected if failed:** boot error.
- **Most likely cause:** lost boot order or a bad System Reserved move.
- **Countermove:** re-assert boot order; if System Reserved is broken and only a config backup exists, restore from the external vzdump if one was taken (Move 3) — otherwise STOP and report.
- **Downstream:** only a confirmed good boot unlocks Move 10 cleanup.

### Move 9: Bring the new F: online in Windows
- **Action:** log into Windows → Disk Management → new 400GB disk → Online → Initialize (GPT) → New Simple Volume → letter **F:** → format **NTFS**.
- **Expected if worked:** F: present, NTFS, ~400GB free.
- **Countermove:** if not visible, re-check sata3 attached; rescan disks.
- **Note:** apps that referenced the old F:\ (ASPEL, profiles) point at an empty drive now — restore from the user's backup as a separate step.

### Move 10: Clean up leftovers and record the result
- **Action:** after a good boot, remove confirmed-junk unused images one at a time: inspect `qm config 104`, then `qm set 104 --delete unused0` (repeat for unused1/2/3/5/8 that are verified old copies). Record final `pvesm status`.
- **Expected if worked:** local-lvm ~140GB+ free; hdd1tb holds VM 104 + F:; VM healthy.
- **Countermove:** if unsure whether an `unused` is the ESP/boot copy, leave it (≈0GB cost).
- **Downstream:** update infra memory: new `hdd1tb` storage, VM 104 disks relocated, tiering rule adopted.

---

## PHASE 2 — OPTIONAL: give VM 104 (and the bulk tier) SSD speed
Do NOT start without the user choosing an option. Phase 1 already delivers the two-tier scheme; these only address VM 104 running its OS off the 7200rpm HDD (slower boot / random IO). Pick ONE.

### Option A — Relocate a slimmed VM 104 OS disk back to the SSD (moderate risk)
- **Idea:** shrink Windows C: so the OS disk fits the fast tier; keep bulk/F: on HDD.
- **Recon gate:** inside Windows check C: used space (`Get-Volume`); only viable if C: used ≤ ~80GB after disabling pagefile/hibernation for the shrink.
- **Sketch:** disable pagefile+hibernate → Disk Management shrink C: to ~90GB → shrink the partition → shrink the Proxmox disk to ~95GB (`qm disk resize` cannot shrink; requires offline partition+image shrink — same risk class as ntfsresize: never shrink the image below the partition end) → `qm disk move 104 sata0 local-lvm` → re-enable pagefile.
- **Trade-off:** fast OS + capacity split cleanly, but guest+image shrink is fiddly and error-prone; abort if C: won't shrink enough.

### Option B — SSD read cache in front of the HDD tier via lvmcache (advanced)
- **Idea:** a slice of SSD caches hot blocks of `hdd1tb`, so ALL HDD-backed VMs run near-SSD for their working set — no guest surgery.
- **Hard constraint:** lvmcache needs the cache LV and the cached LV in the SAME volume group. Today SSD=VG `pve`, HDD=VG `hdd1tb` (separate) — so this requires EITHER a dedicated cache SSD added to VG `hdd1tb`, OR rebuilding the bulk pool inside a single VG that spans both disks. Do not carve cache space out of the live boot SSD's `pve` VG casually (repartitioning the boot disk is high-risk).
- **Safety:** use **writethrough** (reads cached, writes hit HDD too — SSD failure ≠ data loss). Writeback is faster but an SSD failure loses un-flushed writes. Not GUI-managed; survives reboots but PVE upgrades won't maintain it.
- **Trade-off:** best speed-for-effort across the whole tier IF a dedicated cache device is added later; otherwise deferred.

### Recommendation
Ship Phase 1 now (urgent — SSD at 8.6GB free). Then **measure** whether VM 104 on the HDD is actually too slow for the aula workload before adding complexity. If it is: prefer **Option B with a small dedicated cache SSD** (benefits every HDD VM, no guest risk); use **Option A** only if no extra SSD is available and C: shrinks cleanly.

## Unresolved assumptions
- **Phase 2 choice** — undecided by design; needs the user to pick A, B, or "leave 104 on HDD".
- **External backup target for vzdump** — unknown whether node pve / NFS / USB is reachable for a full VM 104 backup before Move 5. If none, only a config-level backup exists (acknowledge risk).
- **C: used space** (Option A only) — unmeasured; gates feasibility.
- **Storage name `hdd1tb`** — assumed; change before Move 4 if desired.

## Abort conditions
- **STOP before wipe if the device is not verifiably /dev/sdb** (ST1000NM0033 / serial Z1W5RS). If it resolves to /dev/sda (ADATA 240GB) or anything else — abort; that is the boot SSD.
- **STOP if `qm disk move` or pool create reports insufficient space** — never hand-delete sources to make room.
- **STOP if VM 104 does not boot after Move 5** — do not delete any `unused` images or take further destructive steps; the moved disks are the only copies.
- **Do NOT start Phase 2** without an explicit option choice from the user.
- **Never touch node pve (192.168.1.4), VM 210, the production panel, or /dev/sda.**
