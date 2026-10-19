import { Splitter } from '@/components/molecules/Splitter';
import { LAYOUT_LIMITS } from '@/features/ui/uiSlice';
import './WorkbenchLayout.css';

export interface WorkbenchLayoutProps {
  top: React.ReactNode;
  ide: React.ReactNode;
  center: React.ReactNode;
  inspector: React.ReactNode;
  strip: React.ReactNode;
  ideOpen: boolean;
  inspectorOpen: boolean;
  ideWidth: number;
  inspectorWidth: number;
  inspectorHeight: number;
  /** right: a sidebar beside the sheet; bottom: a bar under the board strip */
  inspectorDock: 'right' | 'bottom';
  onResize: (key: 'ideWidth' | 'inspectorWidth' | 'inspectorHeight', value: number) => void;
  onResetSize: (key: 'ideWidth' | 'inspectorWidth' | 'inspectorHeight') => void;
  onToggleIde: () => void;
  onToggleInspector: () => void;
}

/** A collapsed pane leaves a rail with a labelled button, so it can always be found again. */
const Rail: React.FC<{ side: 'left' | 'right' | 'bottom'; label: string; shortcut: string; onOpen: () => void }> = ({ side, label, shortcut, onOpen }) => (
  <button type="button" className={`wb__rail wb__rail--${side}`} onClick={onOpen} aria-label={`Show the ${label} (${shortcut})`} title={`Show the ${label} (${shortcut})`}>
    <span>{side === 'left' ? '›' : side === 'right' ? '‹' : '⌃'}</span>
    <span className="wb__railLabel">{label}</span>
  </button>
);

/** The drafting table: IDE · sheet · inspector, with the top bar and the board strip. Side panes resize and collapse. */
export const WorkbenchLayout: React.FC<WorkbenchLayoutProps> = ({
  top,
  ide,
  center,
  inspector,
  strip,
  ideOpen,
  inspectorOpen,
  ideWidth,
  inspectorWidth,
  inspectorHeight,
  inspectorDock,
  onResize,
  onResetSize,
  onToggleIde,
  onToggleInspector,
}) => (
  <div
    className={`wb${ideOpen ? '' : ' no-ide'}${inspectorOpen ? '' : ' no-insp'}${inspectorDock === 'bottom' ? ' dock-bottom' : ''}`}
    style={{ '--ide-w': `${ideWidth}px`, '--insp-w': `${inspectorWidth}px`, '--insp-h': `${inspectorHeight}px` } as React.CSSProperties}
  >
    <div className="wb__top">{top}</div>
    {ideOpen ? (
      <div className="wb__ide">
        {ide}
        <Splitter
          orientation="vertical"
          className="wb__split wb__split--ide"
          label="Resize the editor"
          value={ideWidth}
          min={LAYOUT_LIMITS.ideWidth.min}
          max={LAYOUT_LIMITS.ideWidth.max}
          onChange={(v) => onResize('ideWidth', v)}
          onReset={() => onResetSize('ideWidth')}
          onToggle={onToggleIde}
        />
      </div>
    ) : (
      <Rail side="left" label="lab.js editor" shortcut="⌘/Ctrl+B" onOpen={onToggleIde} />
    )}
    <main className="wb__center">{center}</main>
    {inspectorOpen ? (
      <div className="wb__insp">
        {inspectorDock === 'bottom' ? (
          <Splitter
            orientation="horizontal"
            direction={-1}
            className="wb__split wb__split--inspb"
            label="Resize the inspector"
            value={inspectorHeight}
            min={LAYOUT_LIMITS.inspectorHeight.min}
            max={LAYOUT_LIMITS.inspectorHeight.max}
            onChange={(v) => onResize('inspectorHeight', v)}
            onReset={() => onResetSize('inspectorHeight')}
            onToggle={onToggleInspector}
          />
        ) : (
          <Splitter
            orientation="vertical"
            direction={-1}
            className="wb__split wb__split--insp"
            label="Resize the inspector"
            value={inspectorWidth}
            min={LAYOUT_LIMITS.inspectorWidth.min}
            max={LAYOUT_LIMITS.inspectorWidth.max}
            onChange={(v) => onResize('inspectorWidth', v)}
            onReset={() => onResetSize('inspectorWidth')}
            onToggle={onToggleInspector}
          />
        )}
        {inspector}
      </div>
    ) : (
      <Rail side={inspectorDock === 'bottom' ? 'bottom' : 'right'} label="inspector" shortcut="⌘/Ctrl+Alt+B" onOpen={onToggleInspector} />
    )}
    <div className="wb__strip">{strip}</div>
  </div>
);
