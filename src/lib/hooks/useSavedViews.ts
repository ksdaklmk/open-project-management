import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createSavedView,
  deleteSavedView,
  duplicateSavedView,
  getDefaultSavedView,
  listSavedViews,
  setDefaultSavedView,
  updateSavedView,
  type SavedViewConfiguration,
  type SavedViewType,
  type SavedViewVisibility,
} from '../../data/savedViewsRepo'

export const savedViewsQueryKey = (workspaceId: string, viewType: SavedViewType) => [
  'saved-views',
  workspaceId,
  viewType,
]
export const defaultSavedViewQueryKey = (workspaceId: string, viewType: SavedViewType) => [
  'saved-view-default',
  workspaceId,
  viewType,
]

export function useSavedViews(workspaceId: string, viewType: SavedViewType) {
  return useQuery({
    queryKey: savedViewsQueryKey(workspaceId, viewType),
    queryFn: () => listSavedViews(workspaceId, viewType),
    enabled: !!workspaceId,
  })
}

export function useDefaultSavedView(workspaceId: string, viewType: SavedViewType) {
  return useQuery({
    queryKey: defaultSavedViewQueryKey(workspaceId, viewType),
    queryFn: () => getDefaultSavedView(workspaceId, viewType),
    enabled: !!workspaceId,
  })
}

const useInvalidateSavedViews = (workspaceId: string, viewType: SavedViewType) => {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: savedViewsQueryKey(workspaceId, viewType) })
    void queryClient.invalidateQueries({
      queryKey: defaultSavedViewQueryKey(workspaceId, viewType),
    })
  }
}

export function useCreateSavedView(workspaceId: string, viewType: SavedViewType) {
  const invalidate = useInvalidateSavedViews(workspaceId, viewType)
  return useMutation({
    mutationKey: ['saved-view-create'],
    mutationFn: (input: {
      name: string
      configuration: SavedViewConfiguration
      visibility: SavedViewVisibility
    }) => createSavedView({ workspaceId, viewType, ...input }),
    onSuccess: (view) => {
      invalidate()
      toast.success(`Saved “${view.name}”`)
    },
    onError: (error) => toast.error(`Couldn't save view: ${(error as Error).message}`),
  })
}

export function useUpdateSavedView(workspaceId: string, viewType: SavedViewType) {
  const invalidate = useInvalidateSavedViews(workspaceId, viewType)
  return useMutation({
    mutationKey: ['saved-view-update'],
    mutationFn: (input: {
      id: string
      name: string
      configuration: SavedViewConfiguration
      visibility: SavedViewVisibility
    }) => updateSavedView(input),
    onSuccess: (view) => {
      invalidate()
      toast.success(`Updated “${view.name}”`)
    },
    onError: (error) => toast.error(`Couldn't update view: ${(error as Error).message}`),
  })
}

export function useDuplicateSavedView(workspaceId: string, viewType: SavedViewType) {
  const invalidate = useInvalidateSavedViews(workspaceId, viewType)
  return useMutation({
    mutationKey: ['saved-view-duplicate'],
    mutationFn: ({ id, name }: { id: string; name?: string }) => duplicateSavedView(id, name),
    onSuccess: (view) => {
      invalidate()
      toast.success(`Duplicated as “${view.name}”`)
    },
    onError: (error) => toast.error(`Couldn't duplicate view: ${(error as Error).message}`),
  })
}

export function useDeleteSavedView(workspaceId: string, viewType: SavedViewType) {
  const invalidate = useInvalidateSavedViews(workspaceId, viewType)
  return useMutation({
    mutationKey: ['saved-view-delete'],
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => {
      invalidate()
      toast.success('Saved view deleted')
    },
    onError: (error) => toast.error(`Couldn't delete view: ${(error as Error).message}`),
  })
}

export function useSetDefaultSavedView(workspaceId: string, viewType: SavedViewType) {
  const invalidate = useInvalidateSavedViews(workspaceId, viewType)
  return useMutation({
    mutationKey: ['saved-view-default'],
    mutationFn: (id: string | null) => setDefaultSavedView(workspaceId, viewType, id),
    onSuccess: (_result, id) => {
      invalidate()
      toast.success(id ? 'Default view set' : 'Default view cleared')
    },
    onError: (error) => toast.error(`Couldn't update default: ${(error as Error).message}`),
  })
}
