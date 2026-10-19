import './EmptyState.css';

export const EmptyState: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="empty">
    <div className="empty__title">{title}</div>
    {hint ? <div className="empty__hint">{hint}</div> : null}
  </div>
);
