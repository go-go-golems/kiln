import { useBoard } from '@/app/board-context';
import { Segmented } from '@/components/atoms/Segmented';
import { Slider } from '@/components/atoms/Slider';
import { makeDollar } from '@/lang/runtime';
import { normalizeOptions, type ParamSpec } from '@/lang/params';
import type { SignalRef } from '@/lang/refs';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';

/** An ad hoc control bound to a board signal (`toggle([...]).bind(sig)`), as opposed to a declared parameter. */
export const ControlView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const spec = view.args[0] as ParamSpec;
  const sig = view.args[1] as SignalRef;
  const value = makeDollar(ctx.reg, ctx.state)(sig);
  if (spec.control === 'slider')
    return <Slider label={sig.name} value={Number(value)} min={spec.c.min ?? 0} max={spec.c.max ?? 1} step={spec.c.step} onChange={(v) => ctx.setRef(sig, v)} />;
  const options = normalizeOptions(spec.c.options) ?? [];
  return <Segmented label={sig.name} value={value} options={options} onChange={(v) => ctx.setRef(sig, v)} />;
};
