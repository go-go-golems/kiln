import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { capabilities, knownHosts, setLocalReport, type LocalReport } from '@/data/capabilities';
import { server } from './server';

export interface CapabilityReport {
  host: string;
  arch: string;
  gpu: string;
  cpu: string;
  coreClasses: string[];
  tools: Record<string, string>;
  unsupportedCounters: string[];
  synthetic: boolean;
}

/**
 * Host reports for the Runs tab. `local` is the lab server's probe of this machine (real); the remote hosts'
 * reports are synthetic and live in the client until the runner can reach them.
 */
export const labApi = createApi({
  reducerPath: 'labApi',
  baseQuery: fakeBaseQuery<{ message: string }>(),
  endpoints: (b) => ({
    hosts: b.query<string[], void>({
      queryFn: async () => ({ data: knownHosts() }),
    }),
    capabilities: b.query<CapabilityReport, string>({
      queryFn: async (host) => {
        try {
          if (host === 'local') setLocalReport(await server.get<LocalReport>('/hosts/local/capabilities', 10_000));
          const c = capabilities(host);
          return {
            data: {
              host: c.host,
              arch: c.arch,
              gpu: c.gpu.name,
              cpu: c.cpu.name,
              coreClasses: c.cpu.coreClasses,
              tools: c.tools,
              unsupportedCounters: c.counters.unsupported,
              synthetic: c.synthetic,
            },
          };
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
      },
    }),
  }),
});

export const { useHostsQuery, useCapabilitiesQuery } = labApi;
