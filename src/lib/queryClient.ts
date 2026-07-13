import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { recordTelemetry } from './observability'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) =>
      recordTelemetry('rpc_failure', {
        operation: String(query.queryKey[0] ?? 'query'),
        status: 'error',
        error_name: error.name,
      }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      recordTelemetry('mutation_failure', {
        operation: String(mutation.options.mutationKey?.[0] ?? 'mutation'),
        status: 'error',
        error_name: error.name,
      }),
  }),
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})
