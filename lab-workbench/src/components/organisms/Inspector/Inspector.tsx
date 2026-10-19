import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Chip } from '@/components/atoms/Chip';
import { IconButton } from '@/components/atoms/IconButton';
import { TabBar } from '@/components/molecules/TabBar/TabBar';
import { selectJobs } from '@/features/jobs/jobsSlice';
import { selectLabParams } from '@/features/params/paramsSlice';
import { setTab, type InspectorTab } from '@/features/selection/selectionSlice';
import { setInspectorDock } from '@/features/ui/uiSlice';
import type { IR } from '@/lang/ir';
import type { BuildRegistry } from '@/lang/runtime';
import { AgentRail } from '../AgentRail';
import { GraphTab } from '../GraphTab';
import { InspectTab } from '../InspectTab';
import { LabTab } from '../LabTab';
import { PlanTab } from '../PlanTab';
import { RunsTab } from '../RunsTab';
import './Inspector.css';

export const Inspector: React.FC<{ labId: string; boardId: string; ir: IR; reg: BuildRegistry }> = ({ labId, boardId, ir, reg }) => {
  const dispatch = useAppDispatch();
  const tab = useAppSelector((s) => s.selection.tab);
  const dock = useAppSelector((s) => s.ui.inspectorDock);
  const pending = useAppSelector((s) => selectLabParams(s, labId).pending);
  const proposed = useAppSelector((s) => selectJobs(s, labId).filter((j) => j.status === 'proposed').length);
  const toRun = ir.plan.execute + ir.plan.import + (pending?.captures.length ?? 0);
  return (
    <aside className={`insp-shell insp-shell--${dock}`} aria-label="Inspector">
      <div className="insp-shell__bar">
      <TabBar<InspectorTab>
        idPrefix="insp"
        label="Inspector"
        active={tab}
        onChange={(t) => dispatch(setTab(t))}
        tabs={[
          { id: 'lab', label: 'Lab' },
          { id: 'graph', label: 'Graph' },
          { id: 'plan', label: 'Plan', badge: toRun || proposed ? <Chip tone="warn" variant="tint">{proposed ? `${proposed} to approve` : toRun}</Chip> : undefined },
          { id: 'runs', label: 'Runs' },
          { id: 'inspect', label: 'Inspect' },
          { id: 'agent', label: 'Agent' },
        ]}
      />
        <IconButton
          size="sm"
          className="insp-shell__dock"
          icon={dock === 'right' ? 'dockBottom' : 'dockRight'}
          label={dock === 'right' ? 'Dock the inspector at the bottom' : 'Dock the inspector on the right'}
          onClick={() => dispatch(setInspectorDock(undefined))}
        />
      </div>
      <div className={`insp-shell__body${tab === 'agent' ? ' is-agent' : ''}`} id={`insp-panel-${tab}`} role="tabpanel" aria-labelledby={`insp-tab-${tab}`}>
        {tab === 'lab' ? <LabTab labId={labId} ir={ir} reg={reg} /> : null}
        {tab === 'graph' ? <GraphTab ir={ir} boardId={boardId} /> : null}
        {tab === 'plan' ? <PlanTab labId={labId} ir={ir} /> : null}
        {tab === 'runs' ? <RunsTab labId={labId} ir={ir} reg={reg} boardId={boardId} /> : null}
        {tab === 'inspect' ? <InspectTab reg={reg} /> : null}
        {tab === 'agent' ? <AgentRail labId={labId} boardId={boardId} ir={ir} /> : null}
      </div>
    </aside>
  );
};
