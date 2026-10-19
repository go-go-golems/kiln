import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useAppStore } from './hooks';
import { getRegistry } from './registry';
import { selectLabParams } from '@/features/params/paramsSlice';
import { changeParam } from '@/features/params/thunks';
import { hydrate, type InspectorTab } from '@/features/selection/selectionSlice';
import { log } from '@/features/ui/uiSlice';
import { decodeParam, encodeParam } from '@/lang/params';
import type { IR } from '@/lang/ir';

const TABS: InspectorTab[] = ['lab', 'graph', 'plan', 'runs', 'inspect', 'agent'];
// the default tab is left out of the URL
const DEFAULT_TAB: InspectorTab = 'lab';

/** Parameter values, the inspector tab and the selection live in the query string (design/03 §5.3, §8). */
export const UrlSync: React.FC<{ labId: string; boardId: string; ir: IR }> = ({ labId, boardId, ir }) => {
  const dispatch = useAppDispatch();
  const nav = useNavigate();
  const location = useLocation();
  const values = useAppSelector((s) => selectLabParams(s, labId).values);
  const selection = useAppSelector((s) => s.selection);
  const written = useRef<string | null>(null);
  const store = useAppStore();
  const board = ir.boards.find((b) => b.id === boardId);
  const reg = getRegistry(ir.buildId);

  // URL → state
  useEffect(() => {
    if (!board || !reg) return;
    if (location.search === written.current) return;
    const sp = new URLSearchParams(location.search);
    const known = new Set(['tab', 'sel', 'node']);
    for (const key of board.paramKeys) {
      const p = ir.params.find((x) => x.key === key);
      const spec = reg.params.get(key)?.slot.spec;
      if (!p || !spec || !p.urlEnabled) continue;
      known.add(p.urlKey);
      const text = sp.get(p.urlKey);
      const current = key in values ? values[key] : p.defaultValue;
      if (text === null) {
        if (JSON.stringify(current) !== JSON.stringify(p.defaultValue)) dispatch(changeParam(labId, key, p.defaultValue));
        continue;
      }
      const res = decodeParam(spec, text, p.options);
      if (!res.ok) {
        dispatch(log('warn', `URL parameter ${p.urlKey}=${text} ignored: ${res.error}; using ${JSON.stringify(current)}`));
        continue;
      }
      if (JSON.stringify(res.value) !== JSON.stringify(current)) dispatch(changeParam(labId, key, res.value));
    }
    for (const k of sp.keys()) if (!known.has(k)) dispatch(log('warn', `URL key "${k}" is not a parameter of this board; kept and ignored`));
    const tab = sp.get('tab') as InspectorTab | null;
    dispatch(hydrate({ tab: tab && TABS.includes(tab) ? tab : DEFAULT_TAB, sel: sp.get('sel'), node: sp.get('node') }));
  }, [location.search, board?.id, ir.buildId]);

  // state → URL
  useEffect(() => {
    if (!board || !reg) return;
    // read the store, not this render's values: in the commit where the URL → state effect has just decoded
    // the URL, the rendered values are still the old ones and would strip the parameters from the URL
    const current = store.getState();
    const values = selectLabParams(current, labId).values;
    const selection = current.selection;
    const sp = new URLSearchParams();
    for (const key of board.paramKeys) {
      const p = ir.params.find((x) => x.key === key);
      const spec = reg.params.get(key)?.slot.spec;
      if (!p || !spec || !p.urlEnabled || !(key in values)) continue;
      const enc = encodeParam(spec, values[key], p.defaultValue);
      if (enc !== null) sp.set(p.urlKey, enc);
    }
    if (selection.tab !== DEFAULT_TAB) sp.set('tab', selection.tab);
    if (selection.sel) sp.set('sel', selection.sel);
    if (selection.node) sp.set('node', selection.node);
    const next = sp.toString() ? `?${sp.toString()}` : '';
    if (next === location.search) return;
    const paramsChanged = [...new URLSearchParams(location.search).keys()].filter((k) => !['tab', 'sel', 'node'].includes(k)).join() !== [...sp.keys()].filter((k) => !['tab', 'sel', 'node'].includes(k)).join() || board.paramKeys.some((k) => {
      const p = ir.params.find((x) => x.key === k);
      return p && new URLSearchParams(location.search).get(p.urlKey) !== sp.get(p.urlKey);
    });
    written.current = next;
    nav({ pathname: location.pathname, search: next }, { replace: !paramsChanged });
  }, [values, selection, board?.id, ir.buildId]);

  return null;
};
