import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/atoms/Button';
import { Checkbox } from '@/components/atoms/Checkbox';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { CodeEditor } from '@/components/molecules/CodeEditor';
import { ConsoleLog } from '@/components/molecules/ConsoleLog';
import { EmptyState } from '@/components/molecules/EmptyState';
import { TabBar } from '@/components/molecules/TabBar/TabBar';
import { buildLab } from '@/features/build/thunks';
import { resetSource, selectEdited, selectSource, setAutoBuild, setSource } from '@/features/program/programSlice';
import { clearConsole, LAYOUT_LIMITS, resetSize, resize, toggleIde } from '@/features/ui/uiSlice';
import { IconButton } from '@/components/atoms/IconButton';
import { Splitter } from '@/components/molecules/Splitter';
import { presetById } from '@/presets';
import { PresetPicker } from '../PresetPicker';
import { REFERENCE } from './reference';
import './IdePane.css';

type IdeTab = 'source' | 'replies' | 'reference';

export const IdePane: React.FC<{ labId: string }> = ({ labId }) => {
  const dispatch = useAppDispatch();
  const source = useAppSelector((s) => selectSource(s, labId));
  const edited = useAppSelector((s) => selectEdited(s, labId));
  const autoBuild = useAppSelector((s) => s.program.autoBuild);
  const error = useAppSelector((s) => s.build.byLab[labId]?.error);
  const lines = useAppSelector((s) => s.ui.console);
  const consoleHeight = useAppSelector((s) => s.ui.consoleHeight);
  const [tab, setTab] = useState<IdeTab>('source');
  const preset = presetById(labId);
  const built = useRef(source);
  useEffect(() => {
    built.current = source;
  }, [labId]);
  useEffect(() => {
    if (!autoBuild || source === built.current) return;
    const t = setTimeout(() => {
      built.current = source;
      dispatch(buildLab(labId, 'auto build'));
    }, 450);
    return () => clearTimeout(t);
  }, [source, autoBuild, labId, dispatch]);
  return (
    <aside className="ide" aria-label="Program editor">
      <div className="ide__head">
        <div className="ide__headrow">
          <PresetPicker labId={labId} />
          <IconButton icon="chevronLeft" label="Hide the editor (⌘/Ctrl+B)" onClick={() => dispatch(toggleIde(false))} />
        </div>
        <p className="ide__desc">{preset?.description}</p>
      </div>
      <TabBar<IdeTab>
        idPrefix="ide"
        label="Program"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'source', label: 'lab.js', badge: edited ? <Chip tone="sig">edited</Chip> : undefined },
          { id: 'replies', label: 'replies' },
          { id: 'reference', label: 'reference' },
        ]}
      />
      <div className="ide__body" id={`ide-panel-${tab}`} role="tabpanel" aria-labelledby={`ide-tab-${tab}`}>
        {tab === 'source' ? (
          <>
            <div className="ide__tools">
              <Checkbox label="Auto build" checked={autoBuild} onChange={(v) => dispatch(setAutoBuild(v))} />
              {edited ? (
                <Button size="sm" variant="ghost" icon="reset" onClick={() => dispatch(resetSource(labId))}>
                  Reset to preset
                </Button>
              ) : null}
            </div>
            <div className="ide__editor">
              <CodeEditor
                label="lab.js source"
                value={source}
                errorLine={error?.line}
                onChange={(v) => dispatch(setSource({ labId, source: v }))}
                onSubmit={() => {
                  built.current = source;
                  dispatch(buildLab(labId, 'build'));
                }}
              />
            </div>
            {error ? (
              <div className="ide__error" role="alert">
                {error.message}
                {error.line ? ` · lab.js:${error.line}` : ''}
              </div>
            ) : null}
          </>
        ) : tab === 'replies' ? (
          preset?.replies ? (
            <div className="ide__editor">
              <CodeEditor label="Scripted agent replies" value={preset.replies} readOnly onChange={() => undefined} />
            </div>
          ) : (
            <EmptyState title="No scripted replies" hint="Scenario A and Scenario C ship agent replies that run real code." />
          )
        ) : (
          <div className="ide__ref">
            {REFERENCE.map((g) => (
              <section key={g.title}>
                <Eyebrow as="h3">{g.title}</Eyebrow>
                <pre>{g.lines.join('\n')}</pre>
              </section>
            ))}
          </div>
        )}
      </div>
      <div className="ide__console" style={{ height: consoleHeight }}>
        <Splitter
          orientation="horizontal"
          direction={-1}
          className="ide__consolesplit"
          label="Resize the console"
          value={consoleHeight}
          min={LAYOUT_LIMITS.consoleHeight.min}
          max={LAYOUT_LIMITS.consoleHeight.max}
          onChange={(value) => dispatch(resize({ key: 'consoleHeight', value }))}
          onReset={() => dispatch(resetSize('consoleHeight'))}
        />
        <div className="ide__consolehead">
          <Eyebrow>Console</Eyebrow>
          <Button size="sm" variant="ghost" onClick={() => dispatch(clearConsole())}>
            Clear
          </Button>
        </div>
        <ConsoleLog lines={lines} />
      </div>
    </aside>
  );
};
