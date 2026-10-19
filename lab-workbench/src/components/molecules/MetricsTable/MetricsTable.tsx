import type { Ent } from '@/lang/rows';
import type { Value } from '@/lang/values';
import { ValueCell } from '../ValueCell';
import './MetricsTable.css';

export const DEFAULT_METRICS = [
  'gpu__time_duration.sum',
  'launch__registers_per_thread',
  'launch__shared_mem_per_block_static',
  'sm__warps_active.avg.pct_of_peak_sustained_active',
  'sm__maximum_warps_per_active_cycle_pct',
  'dram__bytes_read.sum',
  'dram__bytes_write.sum',
  'lts__t_bytes.sum',
  'smsp__average_warps_issue_stalled_long_scoreboard_per_issue_active.ratio',
  'smsp__pcsamp_warps_issue_stalled_barrier',
];

/** Every metric with its unit, scope, denominator and source; unavailable counters stay visible as missing. */
export const MetricsTable: React.FC<{ entity: Ent; names?: string[] }> = ({ entity, names }) => {
  const own = Object.keys((entity.metrics as Record<string, Value> | undefined) ?? {});
  const list = [...new Set([...(names ?? DEFAULT_METRICS), ...own])];
  return (
    <div className="metrics">
      <table>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Value</th>
            <th scope="col">Scope · denominator</th>
          </tr>
        </thead>
        <tbody>
          {list.map((name) => {
            const v = entity.metric(name);
            return (
              <tr key={name}>
                <th scope="row" title={v.method ?? v.reason}>
                  {name}
                </th>
                <td>
                  <ValueCell value={v} />
                </td>
                <td className="metrics__scope">{v.value === null ? v.reason : [v.scope, v.denominator].filter(Boolean).join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
