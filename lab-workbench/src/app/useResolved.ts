import { useMemo } from 'react';
import { useBoard } from './board-context';

/** Evaluate view inputs against the current board state; errors render in the panel, not as a crash. */
export function useResolved<T>(fn: (resolve: (x: unknown) => unknown) => T, deps: unknown[]): { value?: T; error?: unknown } {
  const ctx = useBoard();
  return useMemo(() => {
    try {
      return { value: fn(ctx.resolve) };
    } catch (error) {
      return { error };
    }
  }, [ctx.resolve, ...deps]);
}
