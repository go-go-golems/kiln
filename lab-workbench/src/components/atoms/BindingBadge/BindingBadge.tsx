import type { Binding } from '@/lang/refs';
import './BindingBadge.css';

const HELP: Record<Binding, string> = {
  view: 'VIEW — read only by live lambdas; a change re-renders immediately',
  data: 'DATA — read by a derive; a change recomputes derived rows',
  plan: 'PLAN — read by a plan lambda; a change needs new runs and becomes a pending plan',
};

export const BindingBadge: React.FC<{ binding: Binding; pending?: boolean }> = ({ binding, pending }) => (
  <span className={`binding binding--${binding}${pending ? ' is-pending' : ''}`} title={HELP[binding]}>
    {pending ? 'PLAN · PENDING' : binding.toUpperCase()}
  </span>
);
