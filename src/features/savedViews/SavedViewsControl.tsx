import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  SavedViewConfiguration,
  SavedViewType,
  SavedViewVisibility,
} from '../../data/savedViewsRepo'
import { AppIcon } from '../../components/AppIcon'
import { useActorId } from '../../lib/hooks/useSession'
import {
  useCreateSavedView,
  useDefaultSavedView,
  useDeleteSavedView,
  useDuplicateSavedView,
  useSavedViews,
  useSetDefaultSavedView,
  useUpdateSavedView,
} from '../../lib/hooks/useSavedViews'

interface SavedViewsControlProps {
  workspaceId: string
  viewType: SavedViewType
  configuration: SavedViewConfiguration
  savedViewId: string | null
  hasExplicitConfiguration: boolean
  onApply: (configuration: SavedViewConfiguration, id: string) => void
  onClearSavedView: () => void
}

export function SavedViewsControl({
  workspaceId,
  viewType,
  configuration,
  savedViewId,
  hasExplicitConfiguration,
  onApply,
  onClearSavedView,
}: SavedViewsControlProps) {
  const actorId = useActorId()
  const views = useSavedViews(workspaceId, viewType)
  const defaultView = useDefaultSavedView(workspaceId, viewType)
  const create = useCreateSavedView(workspaceId, viewType)
  const update = useUpdateSavedView(workspaceId, viewType)
  const duplicate = useDuplicateSavedView(workspaceId, viewType)
  const remove = useDeleteSavedView(workspaceId, viewType)
  const setDefault = useSetDefaultSavedView(workspaceId, viewType)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createVisibility, setCreateVisibility] = useState<SavedViewVisibility>('private')
  const [editDraft, setEditDraft] = useState<{
    id: string
    name: string
    visibility: SavedViewVisibility
  } | null>(null)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)
  const [managedId, setManagedId] = useState<string | null>(savedViewId)
  const autoApplied = useRef(new Set<string>())

  const selected = views.data?.find((view) => view.id === (savedViewId ?? managedId)) ?? null
  const selectedDraft = selected
    ? editDraft?.id === selected.id
      ? editDraft
      : { id: selected.id, name: selected.name, visibility: selected.visibility }
    : null
  const isOwner = selected?.ownerId === actorId
  const isDefault = selected?.id === defaultView.data?.id
  const confirmDelete = selected?.id === deleteCandidateId
  const pending =
    create.isPending ||
    update.isPending ||
    duplicate.isPending ||
    remove.isPending ||
    setDefault.isPending

  useEffect(() => {
    if (savedViewId) {
      const key = `link:${savedViewId}`
      if (!hasExplicitConfiguration && selected && !autoApplied.current.has(key)) {
        autoApplied.current.add(key)
        setManagedId(selected.id)
        onApply(selected.configuration, selected.id)
      }
      return
    }
    const key = `default:${workspaceId}:${viewType}`
    if (
      !hasExplicitConfiguration &&
      defaultView.isSuccess &&
      defaultView.data &&
      !autoApplied.current.has(key)
    ) {
      autoApplied.current.add(key)
      setManagedId(defaultView.data.id)
      onApply(defaultView.data.configuration, defaultView.data.id)
    }
  }, [
    defaultView.data,
    defaultView.isSuccess,
    hasExplicitConfiguration,
    onApply,
    savedViewId,
    selected,
    viewType,
    workspaceId,
  ])

  const submitCreate = (event: React.FormEvent) => {
    event.preventDefault()
    const name = createName.trim()
    if (!name) return
    create.mutate(
      { name, configuration, visibility: createVisibility },
      {
        onSuccess: (view) => {
          setCreateName('')
          setCreating(false)
          setManagedId(view.id)
          onApply(view.configuration, view.id)
        },
      },
    )
  }

  const saveChanges = () => {
    if (!selected || !selectedDraft || !isOwner || !selectedDraft.name.trim()) return
    update.mutate(
      {
        id: selected.id,
        name: selectedDraft.name.trim(),
        configuration,
        visibility: selectedDraft.visibility,
      },
      {
        onSuccess: (view) => {
          setManagedId(view.id)
          onApply(view.configuration, view.id)
        },
      },
    )
  }

  const duplicateSelected = () => {
    if (!selected) return
    duplicate.mutate(
      { id: selected.id, name: `${selected.name} copy`.slice(0, 80) },
      {
        onSuccess: (view) => {
          setManagedId(view.id)
          onApply(view.configuration, view.id)
        },
      },
    )
  }

  const deleteSelected = () => {
    if (!selected || !isOwner) return
    if (!confirmDelete) {
      setDeleteCandidateId(selected.id)
      return
    }
    remove.mutate(selected.id, {
      onSuccess: () => {
        setDeleteCandidateId(null)
        setManagedId(null)
        onClearSavedView()
      },
    })
  }

  const copyLink = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable')
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Share link copied')
    } catch (error) {
      toast.error(`Couldn't copy link: ${(error as Error).message}`)
    }
  }

  return (
    <details className="opm-filter relative">
      <summary className="opm-btn list-none" aria-label="Saved views">
        Saved views
        {views.data?.length ? ` (${views.data.length})` : ''}
        <AppIcon name="chevronDown" size={12} />
      </summary>
      <div className="opm-filter-menu left-0 w-[22rem] gap-2" data-testid="saved-views-menu">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {viewType} views
          </span>
          <button type="button" className="opm-btn" onClick={() => setCreating((open) => !open)}>
            {creating ? 'Cancel' : 'Save current'}
          </button>
        </div>

        {creating && (
          <form className="grid gap-2 border-b border-[var(--border)] pb-2" onSubmit={submitCreate}>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              New saved view name
              <input
                autoFocus
                className="opm-input"
                maxLength={80}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              New saved view visibility
              <select
                className="opm-select"
                value={createVisibility}
                onChange={(event) => setCreateVisibility(event.target.value as SavedViewVisibility)}
              >
                <option value="private">Private — only me</option>
                <option value="workspace">Workspace — anyone here</option>
              </select>
            </label>
            <button
              type="submit"
              className="opm-btn-primary justify-center"
              disabled={!createName.trim() || pending}
            >
              Create saved view
            </button>
          </form>
        )}

        {views.isLoading ? (
          <p role="status" className="py-2 text-sm text-[var(--muted)]">
            Loading saved views…
          </p>
        ) : views.error ? (
          <div role="alert" className="py-2 text-sm">
            <p>Couldn’t load saved views.</p>
            <button type="button" className="opm-btn mt-2" onClick={() => views.refetch()}>
              Retry
            </button>
          </div>
        ) : views.data?.length ? (
          <ul className="grid gap-1" aria-label="Available saved views">
            {views.data.map((view) => (
              <li key={view.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]${
                    selected?.id === view.id ? ' bg-[var(--accent-soft)]' : ''
                  }`}
                  aria-current={selected?.id === view.id ? 'true' : undefined}
                  onClick={() => {
                    setManagedId(view.id)
                    onApply(view.configuration, view.id)
                  }}
                >
                  <span className="min-w-0 truncate font-medium">{view.name}</span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {view.visibility === 'private' ? 'Private' : 'Workspace'}
                    {defaultView.data?.id === view.id ? ' · Default' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-[var(--muted)]">
            Save the current filters so you can return to them.
          </p>
        )}

        {selected && (
          <section
            className="grid gap-2 border-t border-[var(--border)] pt-2"
            aria-label="Manage selected saved view"
          >
            {isOwner && (
              <>
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  Saved view name
                  <input
                    className="opm-input"
                    maxLength={80}
                    value={selectedDraft?.name ?? ''}
                    onChange={(event) =>
                      setEditDraft({
                        id: selected.id,
                        name: event.target.value,
                        visibility: selectedDraft?.visibility ?? selected.visibility,
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  Saved view visibility
                  <select
                    className="opm-select"
                    value={selectedDraft?.visibility ?? selected.visibility}
                    onChange={(event) =>
                      setEditDraft({
                        id: selected.id,
                        name: selectedDraft?.name ?? selected.name,
                        visibility: event.target.value as SavedViewVisibility,
                      })
                    }
                  >
                    <option value="private">Private — only me</option>
                    <option value="workspace">Workspace — anyone here</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="opm-btn justify-center"
                  disabled={!selectedDraft?.name.trim() || pending}
                  onClick={saveChanges}
                >
                  Update with current filters
                </button>
              </>
            )}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="opm-btn"
                disabled={pending}
                onClick={duplicateSelected}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="opm-btn"
                disabled={pending}
                onClick={() => setDefault.mutate(isDefault ? null : selected.id)}
              >
                {isDefault ? 'Clear default' : 'Set as default'}
              </button>
              {selected.visibility === 'workspace' && (
                <button type="button" className="opm-btn" onClick={() => void copyLink()}>
                  Copy share link
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  className="opm-btn"
                  disabled={pending}
                  onClick={deleteSelected}
                >
                  {confirmDelete ? 'Confirm delete' : 'Delete'}
                </button>
              )}
            </div>
            {selected.visibility === 'private' && (
              <p className="text-xs text-[var(--muted)]">
                Make this workspace-visible before sharing it.
              </p>
            )}
          </section>
        )}
      </div>
    </details>
  )
}
