import './Chip.css';

export interface ChipProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'sig' | 'warn' | 'bad' | 'ok';
  variant?: 'outline' | 'tint' | 'solid';
  title?: string;
}

/** Small mono marker. Tinted variants are reserved for states that carry meaning. */
export const Chip: React.FC<ChipProps> = ({ children, tone = 'neutral', variant = 'outline', title }) => (
  <span className={`chip chip--${tone} chip--${variant}`} title={title}>
    {children}
  </span>
);
