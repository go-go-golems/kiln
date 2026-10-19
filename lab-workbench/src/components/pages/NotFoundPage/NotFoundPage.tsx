import { Link } from 'react-router-dom';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { PRESETS } from '@/presets';
import './NotFoundPage.css';

export const NotFoundPage: React.FC<{ what?: string }> = ({ what }) => (
  <main className="nf">
    <Eyebrow tone="warn">Not found</Eyebrow>
    <h1>{what ?? 'This page does not exist.'}</h1>
    <p>Open one of the labs:</p>
    <ul>
      {PRESETS.map((p) => (
        <li key={p.id}>
          <Link to={`/labs/${p.id}`}>{p.name}</Link>
        </li>
      ))}
    </ul>
  </main>
);
