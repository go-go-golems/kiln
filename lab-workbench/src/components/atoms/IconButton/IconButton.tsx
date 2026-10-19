import { Icon } from '../Icon';
import './IconButton.css';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

/** Square, labelled for assistive technology, never flex-shrinks. */
export const IconButton: React.FC<IconButtonProps> = ({ icon, label, active, size = 'md', className, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    aria-pressed={active}
    className={['icon-btn', `icon-btn--${size}`, active ? 'is-active' : '', className].filter(Boolean).join(' ')}
    {...rest}
  >
    <Icon name={icon} size={size === 'sm' ? 12 : 14} />
  </button>
);
