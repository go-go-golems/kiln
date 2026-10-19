import './Eyebrow.css';

export interface EyebrowProps {
  children: React.ReactNode;
  as?: 'span' | 'div' | 'h2' | 'h3' | 'label';
  htmlFor?: string;
  id?: string;
  tone?: 'muted' | 'ink' | 'accent' | 'sig' | 'warn' | 'bad';
}

/** Stencil label: uppercase, letter-spaced mono. */
export const Eyebrow: React.FC<EyebrowProps> = ({ children, as = 'span', tone = 'muted', ...rest }) => {
  const Tag = as as React.ElementType;
  return (
    <Tag className={`eyebrow eyebrow--${tone}`} {...rest}>
      {children}
    </Tag>
  );
};
