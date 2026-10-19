import './TabBar.css';

export interface Tab<T extends string> {
  id: T;
  label: string;
  badge?: React.ReactNode;
}

/** Tabs with arrow-key traversal (roving tab index). */
export function TabBar<T extends string>({ tabs, active, onChange, label, idPrefix }: { tabs: Tab<T>[]; active: T; onChange: (id: T) => void; label: string; idPrefix: string }) {
  const move = (dir: number) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus());
  };
  return (
    <div
      className="tabbar"
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') (e.preventDefault(), move(1));
        if (e.key === 'ArrowLeft') (e.preventDefault(), move(-1));
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${idPrefix}-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          className={t.id === active ? 'is-on' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.badge ? <span className="tabbar__badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
