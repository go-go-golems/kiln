import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/atoms/Button';
import { Chip } from '@/components/atoms/Chip';
import { IconButton } from '@/components/atoms/IconButton';
import { Kbd } from '@/components/atoms/Kbd';
import { buildLab } from '@/features/build/thunks';
import { selectLabParams } from '@/features/params/paramsSlice';
import { setTab } from '@/features/selection/selectionSlice';
import { setTheme, toggleIde, toggleInspector } from '@/features/ui/uiSlice';
import { presetById } from '@/presets';
import './TopBar.css';

export const TopBar: React.FC<{ labId: string }> = ({ labId }) => {
  const dispatch = useAppDispatch();
  const ui = useAppSelector((s) => s.ui);
  const lb = useAppSelector((s) => s.build.byLab[labId]);
  const pending = useAppSelector((s) => selectLabParams(s, labId).pending);
  const preset = presetById(labId);
  const ir = lb?.ir;
  const errors = ir?.lint.filter((l) => l.level === 'error').length ?? 0;
  const warnings = ir?.lint.filter((l) => l.level === 'warning').length ?? 0;
  const dark = ui.theme === 'dark' || (ui.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const status = lb?.error ? 'error' : errors ? 'error' : warnings ? 'warn' : 'ok';
  return (
    <header className="topbar">
      <IconButton icon="ide" label={ui.ideOpen ? 'Hide the IDE' : 'Show the IDE'} active={ui.ideOpen} onClick={() => dispatch(toggleIde(undefined))} />
      <Link to="/" className="topbar__brand">
        <strong>Perf Lab</strong>
        <Chip>IR · DAG</Chip>
      </Link>
      <nav className="topbar__crumbs" aria-label="Location">
        <ol>
          <li>ML-PERF-001</li>
          <li>{preset?.group ?? 'Lab'}</li>
          <li>
            <Link to={`/labs/${labId}`}>{ir?.title ?? preset?.name ?? labId}</Link>
          </li>
        </ol>
      </nav>
      <span className="topbar__spacer" />
      {pending ? (
        <button type="button" className="topbar__pending" onClick={() => dispatch(setTab('plan'))}>
          <Chip tone="warn" variant="tint">
            pending plan · {pending.captures.length} captures
          </Chip>
        </button>
      ) : null}
      <Button variant="primary" icon="play" onClick={() => dispatch(buildLab(labId, 'build'))} title="Build (⌘/Ctrl + Enter)">
        Build
      </Button>
      <span className={`topbar__status topbar__status--${status}`} role="status">
        {lb?.error
          ? 'build failed'
          : ir
            ? `built in ${ir.durationMs} ms · ${ir.stats.nodes} nodes · ${ir.boards.length} boards${errors ? ` · ${errors} errors` : warnings ? ` · ${warnings} warnings` : ''}`
            : 'not built'}
      </span>
      <Kbd>⌘↵</Kbd>
      <IconButton icon={dark ? 'sun' : 'moon'} label={dark ? 'Use the light theme' : 'Use the dark theme'} onClick={() => dispatch(setTheme(dark ? 'light' : 'dark'))} />
      <IconButton icon="inspector" label={ui.inspectorOpen ? 'Hide the inspector' : 'Show the inspector'} active={ui.inspectorOpen} onClick={() => dispatch(toggleInspector(undefined))} />
    </header>
  );
};
