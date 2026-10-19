import { Eyebrow } from '@/components/atoms/Eyebrow';
import './Panel.css';

/** Chrome for a board view: stencil eyebrow naming the view and its input, body, and an evidence footer. */
export const Panel: React.FC<{
  kind: string;
  input?: string;
  title?: string;
  footer?: React.ReactNode;
  stale?: boolean;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
  actions?: React.ReactNode;
  stamp?: string;
}> = ({ kind, input, title, footer, stale, children, className, flush, actions, stamp }) => (
  <section className={['panel', stale ? 'is-stale' : '', className].filter(Boolean).join(' ')} aria-label={title ?? kind}>
    <header className="panel__head">
      <Eyebrow tone={stale ? 'warn' : 'accent'}>
        {kind}
        {input ? <span className="panel__input"> · {input}</span> : null}
        {stale ? ' · stale for current parameters' : ''}
      </Eyebrow>
      {stamp ? <span className="panel__stamp">{stamp}</span> : null}
      {actions ? <span className="panel__actions">{actions}</span> : null}
    </header>
    {title ? <h3 className="panel__title">{title}</h3> : null}
    <div className={`panel__body${flush ? ' panel__body--flush' : ''}`}>{children}</div>
    {footer ? <footer className="panel__foot">{footer}</footer> : null}
  </section>
);

export const PanelError: React.FC<{ error: unknown }> = ({ error }) => (
  <div className="panel-error" role="alert">
    <strong>Cannot render:</strong> {(error as Error)?.message ?? String(error)}
  </div>
);
