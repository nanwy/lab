import { create } from 'zustand'

type TopologyEditorInteractionState = {
  selectedNodeId?: string
  selectNode: (nodeId?: string) => void
  reset: () => void
}

export const useTopologyEditorInteraction =
  create<TopologyEditorInteractionState>((set) => ({
    selectNode: (selectedNodeId) => set({ selectedNodeId }),
    reset: () => set({ selectedNodeId: undefined }),
  }))
