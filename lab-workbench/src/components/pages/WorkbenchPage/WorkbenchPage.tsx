import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLabBuild, useRuntimeState } from '@/app/board-context';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { UrlSync } from '@/app/UrlSync';
import { EmptyState } from '@/components/molecules/EmptyState';
import { BoardSheet } from '@/components/organisms/BoardSheet';
import { BoardStrip } from '@/components/organisms/BoardStrip';
import { IdePane } from '@/components/organisms/IdePane';
import { Inspector } from '@/components/organisms/Inspector';
import { ParamBar } from '@/components/organisms/ParamBar';
import { TopBar } from '@/components/organisms/TopBar';
import { WorkbenchLayout } from '@/components/templates/WorkbenchLayout';
import { buildLab } from '@/features/build/thunks';
import { loadProgram } from '@/features/server/thunks';
import { select, setTab } from '@/features/selection/selectionSlice';
import { resetSize, resize, toggleIde, toggleInspector } from '@/features/ui/uiSlice';
import { presetById } from '@/presets';
import { NotFoundPage } from '../NotFoundPage';

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export const WorkbenchPage: React.FC = () => {
  const { labId = '', boardId } = useParams();
  const dispatch = useAppDispatch();
  const nav = useNavigate();
  const location = useLocation();
  const ui = useAppSelector((s) => s.ui);
  const { lb, reg, ir } = useLabBuild(labId);
  const state = useRuntimeState(labId);
  const preset = presetById(labId);
  const serverStatus = useAppSelector((s) => s.server.status);
  useEffect(() => {
    // wait for the first server check, so a measured lab does not build once without its host's report
    if (preset && !lb && serverStatus !== 'unknown') dispatch(buildLab(labId, 'initial build'));
  }, [labId, preset, lb, serverStatus, dispatch]);
  useEffect(() => {
    if (preset && serverStatus === 'online') void dispatch(loadProgram(labId));
  }, [labId, preset, serverStatus, dispatch]);
  useEffect(() => {
    if (!ir) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyB') {
        // the conventional sidebar toggles: ⌘/Ctrl+B for the editor, with Alt for the secondary (inspector) side
        e.preventDefault();
        dispatch(e.altKey ? toggleInspector(undefined) : toggleIde(undefined));
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        dispatch(buildLab(labId, 'build'));
      } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        dispatch(setTab('agent'));
        requestAnimationFrame(() => document.getElementById('agent-input')?.focus());
      } else if (!typing(e.target) && (e.key === '[' || e.key === ']')) {
        const i = ir.boards.findIndex((b) => b.id === boardId);
        const next = ir.boards[(i + (e.key === ']' ? 1 : -1) + ir.boards.length) % ir.boards.length];
        if (next) nav(`/labs/${labId}/boards/${next.id}`);
      } else if (!typing(e.target) && e.key === 'Escape' && !document.querySelector('dialog[open]')) {
        dispatch(select(null));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ir, labId, boardId, dispatch, nav]);

  if (!preset) return <NotFoundPage what={`There is no lab called “${labId}”.`} />;
  if (ir && !boardId) return <Navigate to={`/labs/${labId}/boards/${ir.boards[0]?.id ?? 'none'}${location.search}`} replace />;
  const board = ir?.boards.find((b) => b.id === boardId);
  const center =
    !ir || !reg ? (
      <div className="sheetwrap">
        <EmptyState title={lb?.error ? 'Build failed' : 'Building…'} hint={lb?.error?.message} />
      </div>
    ) : !board ? (
      <div className="sheetwrap">
        <EmptyState title={`No board “${boardId}” in this lab`} hint={`Boards: ${ir.boards.map((b) => b.id).join(', ') || 'none'}`} />
      </div>
    ) : (
      <>
        <ParamBar labId={labId} board={board} params={ir.params} reg={reg} state={state} />
        <BoardSheet key={`${labId}/${board.id}`} labId={labId} boardId={board.id} reg={reg} ir={ir} />
      </>
    );
  return (
    <>
      {ir && board ? <UrlSync labId={labId} boardId={board.id} ir={ir} /> : null}
      <WorkbenchLayout
        ideOpen={ui.ideOpen}
        inspectorOpen={ui.inspectorOpen}
        ideWidth={ui.ideWidth}
        inspectorWidth={ui.inspectorWidth}
        inspectorHeight={ui.inspectorHeight}
        inspectorDock={ui.inspectorDock}
        onResize={(key, value) => dispatch(resize({ key, value }))}
        onResetSize={(key) => dispatch(resetSize(key))}
        onToggleIde={() => dispatch(toggleIde(undefined))}
        onToggleInspector={() => dispatch(toggleInspector(undefined))}
        top={<TopBar labId={labId} />}
        ide={<IdePane labId={labId} />}
        center={center}
        inspector={ir && reg ? <Inspector labId={labId} boardId={board?.id ?? ''} ir={ir} reg={reg} /> : <div />}
        strip={ir ? <BoardStrip labId={labId} ir={ir} boardId={board?.id ?? ''} /> : <div />}
      />
    </>
  );
};
