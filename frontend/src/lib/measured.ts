// Measurements from the live kind cluster (deploy/experiment/run.sh), copied from
// evidence/raw_data/live_cluster_runs.csv and the aggregator's /api/profiles.
// Nothing here is modelled; the simulation numbers live in Results.tsx, labelled as such.

export const MEASURED = {
  source: 'aggregator /api/profiles on the 4-node kind cluster, 27 Oct 2026, 60 s window, i5-13500H.',
  profiles: {
    webbench: { cache: 0, lock: 0.000013, pf: 8, cs: 913 },
    cacheStress: { cache: 8_324_000, lock: 0.000016, pf: 0, cs: 649 },
    lockStress: { cache: 153_667, lock: 0.000512, pf: 0, cs: 47_771 },
    batchWorker: { cache: 0, lock: 0.000032, pf: 3364, cs: 35 },
  },
  costLine: 'Next to cache-stress, the web service’s measured p99 rises from 9.2 ms alone to 24.6 ms.',
};
