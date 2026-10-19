import { create } from 'zustand'

type TopologyEditorInteractionState = {
  selectedNodeId?: string
  notice?: string
  selectNode: (nodeId?: string) => void
  setNotice: (notice?: string) => void
  reset: () => void
}

export const useTopologyEditorInteraction =
  create<TopologyEditorInteractionState>((set) => ({
    selectNode: (selectedNodeId) => set({ selectedNodeId }),
    setNotice: (notice) => set({ notice }),
    reset: () => set({ selectedNodeId: undefined, notice: undefined }),
  }))
