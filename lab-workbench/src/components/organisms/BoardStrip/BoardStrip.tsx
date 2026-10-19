import { Link } from 'react-router-dom';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import type { IR } from '@/lang/ir';
import './BoardStrip.css';

const KIND_LABEL: Record<string, string> = {
  timeline: 'timeline',
  chart: 'chart',
  table: 'table',
  mirror: 'mirror',
  stepper: 'stepper',
  ledger: 'ledger',
  hypothesisCard: 'hypothesis',
  kernelCard: 'kernel',
  route: 'route',
};

/** The filmstrip of boards; `[` and `]` move between them. */
export const BoardStrip: React.FC<{ labId: string; ir: IR; boardId: string }> = ({ labId, ir, boardId }) => (
  <nav className="strip" aria-label="Boards">
    <Eyebrow>Boards</Eyebrow>
    <ol>
      {ir.boards.map((b) => {
        const kinds = b.viewKinds.map((k) => KIND_LABEL[k]).filter(Boolean).slice(0, 3);
        return (
          <li key={b.id}>
            <Link to={`/labs/${labId}/boards/${b.id}`} className={`strip__card${b.id === boardId ? ' is-on' : ''}`} aria-current={b.id === boardId ? 'page' : undefined}>
              <span className="strip__num mono">B-{String(b.index + 1).padStart(2, '0')}</span>
              <span className="strip__title">{b.title}</span>
              <span className="strip__chips">
                {kinds.map((k) => (
                  <Chip key={k}>{k}</Chip>
                ))}
                {b.paramKeys.length ? <Chip>{b.paramKeys.length} params</Chip> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  </nav>
);
