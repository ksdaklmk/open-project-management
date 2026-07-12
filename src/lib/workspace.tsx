import { createContext, useContext, useState, type ReactNode } from 'react'
import { useWorkspaces } from './hooks/useWorkspaces'
import { useActorId } from './hooks/useSession'

interface WorkspaceCtx {
  activeId: string | null
  setActiveId: (id: string) => void
  loading: boolean
}
const Ctx = createContext<WorkspaceCtx | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Storage is scoped per signed-in user so one account's last-open workspace
  // never leaks into another account on the same browser (audit finding 1).
  const KEY = `activeWorkspace:${useActorId()}`
  const { data: workspaces, isLoading } = useWorkspaces()
  const [stored, setStored] = useState<string | null>(() => localStorage.getItem(KEY))
  const valid = workspaces?.some((w) => w.id === stored) ? stored : null
  const activeId = valid ?? workspaces?.[0]?.id ?? null
  const setActiveId = (id: string) => {
    localStorage.setItem(KEY, id)
    setStored(id)
  }
  return (
    <Ctx.Provider value={{ activeId, setActiveId, loading: isLoading }}>{children}</Ctx.Provider>
  )
}

export function useActiveWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useActiveWorkspace must be used within WorkspaceProvider')
  return ctx
}
