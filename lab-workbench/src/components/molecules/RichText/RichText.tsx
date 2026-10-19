import { TexMath } from '@/components/atoms/TexMath';
import { tokenizeRich } from './tokenize';

/** Inline rich text: plain prose with `$…$`/`$$…$$` math, **bold** and `code`. */
export const RichText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {tokenizeRich(text).map((t, i) =>
      t.type === 'math' ? (
        <TexMath key={i} tex={t.tex} display={t.display} />
      ) : t.type === 'bold' ? (
        <strong key={i}>{t.text}</strong>
      ) : t.type === 'code' ? (
        <code key={i}>{t.text}</code>
      ) : (
        <span key={i}>{t.text}</span>
      ),
    )}
  </>
);
