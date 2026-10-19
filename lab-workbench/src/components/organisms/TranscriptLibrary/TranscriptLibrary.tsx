import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/atoms/Button';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { Segmented } from '@/components/atoms/Segmented';
import { TextField } from '@/components/atoms/TextField';
import { CodeBlock, CopyButton } from '@/components/molecules/CodeBlock';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { DataBlock } from '@/components/molecules/DataBlock';
import { EmptyState } from '@/components/molecules/EmptyState';
import { RichText } from '@/components/molecules/RichText';
import { setView } from '@/features/agent/agentSlice';
import { continueTranscript } from '@/features/agent/runtime';
import { log } from '@/features/ui/uiSlice';
import { server } from '@/services/server';
import './TranscriptLibrary.css';

interface Summary {
  id: string;
  labId: string;
  boardId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  messages: number;
  prompts: number;
  liveReplies: number;
  tokens: { calls: number; input: number | null; output: number | null; reasoning: number | null; estPrompt: number | null } | null;
  models: string[];
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'observation';
  mode: 'scripted' | 'live';
  content: string;
  code: string | null;
  result: { status: string; value?: string; error?: string; logs?: string[]; ms?: number } | null;
  status: string | null;
  createdAt: string;
  usage: { provider?: string; model?: string; thinking?: string; input?: number; output?: number; reasoning?: number } | null;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const k = (n: number | null | undefined) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The search term marked inside a title, so the eye can see why a row matched. */
const Highlight: React.FC<{ text: string; q: string }> = ({ text, q }) => {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
};

const Transcript: React.FC<{ messages: StoredMessage[] }> = ({ messages }) => (
  <ol className="tlib__transcript">
    {messages
      .filter((m) => m.role !== 'observation')
      .map((m) =>
        m.role === 'user' ? (
          <li key={m.id} className="tlib__msg tlib__msg--user">
            {m.content}
          </li>
        ) : (
          <li key={m.id} className="tlib__msg tlib__msg--assistant">
            <Eyebrow>
              {m.mode === 'live' && m.usage ? `${m.usage.provider}/${m.usage.model}:${m.usage.thinking}` : m.mode}
              {m.usage ? ` · ${k(m.usage.input)} in · ${k(m.usage.output)} out` : ''}
            </Eyebrow>
            {m.content ? (
              <p className="tlib__text">
                <RichText text={m.content} />
              </p>
            ) : null}
            {m.code ? <CodeBlock code={m.code} lang="js" label={m.status === 'skipped' ? 'js · not run' : 'js · eval'} maxHeight={240} /> : null}
            {m.result ? (
              m.result.status === 'ok' ? (
                <DataBlock text={m.result.value ?? 'undefined'} label={`result${m.result.ms !== undefined ? ` · ${m.result.ms} ms` : ''}`} maxHeight={240} />
              ) : (
                <CodeBlock code={m.result.error ?? 'unknown error'} lang="text" label="error · rolled back" maxHeight={140} />
              )
            ) : null}
          </li>
        ),
      )}
  </ol>
);

/**
 * Every stored assistant conversation: clearing the Agent tab archives the current one here. Search covers
 * prompts, replies and code. A transcript can be read, continued on its board, copied or deleted.
 */
export const TranscriptLibrary: React.FC<{ labId: string }> = ({ labId }) => {
  const dispatch = useAppDispatch();
  const nav = useNavigate();
  const online = useAppSelector((s) => s.server.status === 'online');
  const [scope, setScope] = useState<'lab' | 'all'>('lab');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState<(Summary & { transcript: StoredMessage[] }) | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reload, setReload] = useState(0);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (!online) return;
    const ctl = setTimeout(() => {
      const params = new URLSearchParams({ limit: '100' });
      if (scope === 'lab') params.set('lab', labId);
      if (q.trim()) params.set('q', q.trim());
      server
        .get<Summary[]>(`/assistant/library?${params}`)
        .then((r) => {
          setItems(r);
          setError(null);
          setCursor((c) => Math.min(c, Math.max(0, r.length - 1)));
        })
        .catch((e: Error) => setError(e.message));
    }, 200);
    return () => clearTimeout(ctl);
  }, [online, scope, q, labId, reload]);

  const openItem = (s: Summary) =>
    server
      .get<Summary & { transcript: StoredMessage[] }>(`/assistant/library/${s.id}`)
      .then(setOpen)
      .catch((e: Error) => setError(e.message));

  const focusRow = (i: number) => {
    setCursor(i);
    rows.current[i]?.focus();
    rows.current[i]?.scrollIntoView({ block: 'nearest' });
  };

  const onListKey = (e: React.KeyboardEvent, i: number) => {
    if (!items?.length) return;
    if (e.key === 'ArrowDown') (e.preventDefault(), focusRow(Math.min(items.length - 1, i + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), i === 0 ? document.getElementById('tlib-search')?.focus() : focusRow(i - 1));
    else if (e.key === 'Home') (e.preventDefault(), focusRow(0));
    else if (e.key === 'End') (e.preventDefault(), focusRow(items.length - 1));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), void openItem(items[i]));
  };

  const doContinue = async (s: Summary) => {
    if (s.labId !== labId) nav(`/labs/${encodeURIComponent(s.labId)}/boards/${encodeURIComponent(s.boardId)}?tab=agent`);
    try {
      await dispatch(continueTranscript(s.labId, s.id));
      dispatch(log('ok', `continuing “${(s.title ?? s.id).slice(0, 60)}” on ${s.boardId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doDelete = async (s: Summary) => {
    setConfirm(false);
    try {
      const r = await server.del<{ messages: number; calls: number }>(`/assistant/library/${s.id}`);
      dispatch(log('warn', `deleted transcript “${(s.title ?? s.id).slice(0, 60)}”: ${r.messages} messages, ${r.calls} model-call records`));
      setOpen(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const list = useMemo(() => items ?? [], [items]);

  if (!online) return <EmptyState title="The library needs the lab server" hint="Transcripts are stored in its SQLite database; start it with pnpm lab-server." />;

  if (open) {
    return (
      <div className="tlib">
        <div className="tlib__bar">
          <Button size="sm" variant="ghost" icon="back" onClick={() => setOpen(null)}>
            Library
          </Button>
          <span className="tlib__tools">
            <CopyButton text={JSON.stringify(open, null, 2)} what="transcript as JSON" />
            <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirm(true)}>
              Delete
            </Button>
            <Button size="sm" variant="primary" icon="play" onClick={() => void doContinue(open)}>
              {open.archivedAt ? 'Continue here' : 'Open in chat'}
            </Button>
          </span>
        </div>
        <div className="tlib__detailHead">
          <p className="tlib__title">{open.title ?? '(no prompt)'}</p>
          <p className="tlib__meta mono">
            {open.labId} · {open.boardId} · {when(open.createdAt)} · {open.messages} messages · {open.models.join(', ') || 'scripted'}
            {open.tokens?.calls ? ` · ${k(open.tokens.input)} in · ${k(open.tokens.output)} out · ${k(open.tokens.reasoning)} reasoning · prompt ≈ ${k(open.tokens.estPrompt)} (est.)` : ''}
          </p>
        </div>
        <div className="tlib__scroll">
          <Transcript messages={open.transcript} />
        </div>
        <ConfirmDialog
          open={confirm}
          tone="danger"
          title="Delete this transcript?"
          body={`“${(open.title ?? open.id).slice(0, 80)}” and its ${open.messages} messages and ${open.tokens?.calls ?? 0} model-call records (with their token counts) are removed from the database. This cannot be undone.`}
          confirmLabel="Delete transcript"
          onConfirm={() => void doDelete(open)}
          onCancel={() => setConfirm(false)}
        />
      </div>
    );
  }

  return (
    <div className="tlib">
      <div className="tlib__bar">
        <Button size="sm" variant="ghost" icon="back" onClick={() => dispatch(setView('chat'))}>
          Chat
        </Button>
        <Segmented
          size="sm"
          label="Which transcripts"
          value={scope}
          onChange={(v) => setScope(v as 'lab' | 'all')}
          options={[
            { value: 'lab', label: 'This lab' },
            { value: 'all', label: 'All labs' },
          ]}
        />
      </div>
      <div className="tlib__search">
        <TextField
          id="tlib-search"
          label="Search transcripts"
          placeholder="Search prompts, replies and code…"
          value={q}
          onChange={setQ}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && list.length) (e.preventDefault(), focusRow(0));
            if (e.key === 'Enter' && list.length) (e.preventDefault(), void openItem(list[0]));
          }}
        />
      </div>
      {error ? <p className="tlib__error">{error}</p> : null}
      <div className="tlib__scroll">
        {items && !list.length ? (
          <EmptyState title={q ? 'No transcript matches' : 'No transcripts yet'} hint={q ? 'Search covers prompts, replies and code.' : 'Ask the assistant something; clearing the chat moves it here.'} />
        ) : (
          <ul className="tlib__list" role="listbox" aria-label="Transcripts">
            {list.map((s, i) => (
              <li
                key={s.id}
                ref={(el) => {
                  rows.current[i] = el;
                }}
                role="option"
                aria-selected={i === cursor}
                tabIndex={i === cursor ? 0 : -1}
                className={`tlib__row${i === cursor ? ' is-cursor' : ''}`}
                onClick={() => (setCursor(i), void openItem(s))}
                onKeyDown={(e) => onListKey(e, i)}
              >
                <span className="tlib__rowTitle">
                  <Highlight text={s.title ?? '(no prompt)'} q={q.trim()} />
                </span>
                <span className="tlib__meta mono">
                  {scope === 'all' ? `${s.labId} · ` : ''}
                  {s.boardId} · {when(s.updatedAt)} · {s.prompts} prompt{s.prompts === 1 ? '' : 's'}
                  {s.tokens?.calls ? ` · ${k((s.tokens.input ?? 0) + (s.tokens.output ?? 0))} tokens` : ''}
                </span>
                <span className="tlib__chips">
                  <Chip variant="outline">{s.archivedAt ? 'archived' : 'active'}</Chip>
                  {s.liveReplies ? <Chip variant="outline">live</Chip> : <Chip variant="outline">scripted</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
