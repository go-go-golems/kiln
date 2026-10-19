import { ValueCell } from '../ValueCell';
import './KeyValueTable.css';

export interface KVRow {
  key: string;
  value: unknown;
  unit?: string;
  tone?: 'bad' | 'warn' | 'ok' | 'sig';
  note?: string;
}

export const KeyValueTable: React.FC<{ rows: KVRow[]; caption?: string }> = ({ rows, caption }) => (
  <table className="kv">
    {caption ? <caption className="sr-only">{caption}</caption> : null}
    <tbody>
      {rows.map((r) => (
        <tr key={r.key} className={r.tone ? `kv--${r.tone}` : ''}>
          <th scope="row">{r.key}</th>
          <td>
            <ValueCell value={r.value} unit={r.unit} align="left" />
            {r.note ? <span className="kv__note">{r.note}</span> : null}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);
