import { useResolved } from '@/app/useResolved';
import { PanelError } from '@/components/molecules/Panel/Panel';
import { RichText } from '@/components/molecules/RichText';
import { TexMath } from '@/components/atoms/TexMath';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './TextView.css';

const SIZES: Record<string, string> = { sm: '12px', md: '13px', lg: '16px', xl: '20px', '2xl': '26px' };

export const TextView: React.FC<ViewProps> = ({ view }) => {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <PanelError error={r.error} />;
  const text = r.value === null || r.value === undefined ? '' : String(r.value);
  if (!text) return null;
  const color = view.p('color');
  return (
    <p
      className={`textview${view.props.mono ? ' mono' : ''}`}
      style={{
        fontSize: SIZES[String(view.p('size') ?? 'md')],
        fontWeight: view.p('weight') as number | undefined,
        color: color === 'muted' ? 'var(--muted)' : undefined,
      }}
    >
      <RichText text={text} />
    </p>
  );
};

export const NoteView: React.FC<ViewProps> = ({ view }) => {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <PanelError error={r.error} />;
  return (
    <div className="noteview">
      {String(r.value ?? '')
        .split(/\n{2,}/)
        .map((p, i) => (
          <p key={i}>
            <RichText text={p} />
          </p>
        ))}
    </div>
  );
};

/** `math(tex, { display })`: a formula on its own, display style unless `display: false`. */
export const MathView: React.FC<ViewProps> = ({ view }) => {
  const r = useResolved((res) => ({ tex: String(res(view.args[0]) ?? ''), opts: (res(view.args[1]) ?? {}) as { display?: boolean; caption?: string } }), [view]);
  if (r.error) return <PanelError error={r.error} />;
  return (
    <figure className="mathview">
      <TexMath tex={r.value!.tex} display={r.value!.opts.display !== false} />
      {r.value!.opts.caption ? (
        <figcaption>
          <RichText text={r.value!.opts.caption} />
        </figcaption>
      ) : null}
    </figure>
  );
};
