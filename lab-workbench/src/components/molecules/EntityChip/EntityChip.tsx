import { useAppDispatch } from '@/app/hooks';
import { select, setTab } from '@/features/selection/selectionSlice';
import './EntityChip.css';

/** A reference that selects its entity and opens the inspector on it. */
export const EntityChip: React.FC<{ refId: string; label?: string; evidence?: string }> = ({ refId, label, evidence }) => {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      className={`entchip${evidence ? ` entchip--${evidence}` : ''}`}
      title={`${refId}${evidence ? ` · evidence: ${evidence}` : ''}`}
      onClick={() => {
        dispatch(select(refId));
        dispatch(setTab('inspect'));
      }}
    >
      {label ?? refId.split('!').pop()}
    </button>
  );
};
