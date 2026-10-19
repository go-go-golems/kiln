import { Icon } from '../Icon';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: string;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'secondary', size = 'md', icon, children, className, type = 'button', ...rest }) => (
  <button type={type} className={['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ')} {...rest}>
    {icon ? <Icon name={icon} size={size === 'sm' ? 12 : 13} /> : null}
    {children ? <span className="btn__label">{children}</span> : null}
  </button>
);
