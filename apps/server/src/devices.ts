// Devices (guide §23): every device a record names, with the host whose jobs measured it. Hosts and what they can run
// are /api/hosts (exec/hosts.ts); this is the evidence side: which devices have records, and how many.
import type { Fingerprint } from '@kiln/evidence';
import { all, type Db } from './db.ts';

export interface DeviceView {
  id: string;
  class: string;
  name: string;
  fingerprint: Fingerprint;
  /** The host whose jobs last measured it; null for records posted or imported from elsewhere */
  host: string | null;
  records: number;
  firstSeen: string;
  lastSeen: string;
}

export function listDevices(db: Db): DeviceView[] {
  return all<{ id: string; class: string; name: string; fingerprint_json: string; host: string | null; first_seen: string; last_seen: string; n: number }>(
    db,
    'select d.*, (select count(*) from records r where r.device_id = d.id) as n from devices d order by d.class, d.name, d.id',
  ).map((r) => ({ id: r.id, class: r.class, name: r.name, fingerprint: JSON.parse(r.fingerprint_json) as Fingerprint, host: r.host, records: r.n, firstSeen: r.first_seen, lastSeen: r.last_seen }));
}
