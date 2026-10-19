export type Capability =
  | 'overview:view'
  | 'resources:view'
  | 'topology:view'
  | 'drafts:edit'
  | 'diagnostics:view'

export type Identity = {
  displayName: string
  capabilities: ReadonlySet<Capability>
}

// This deterministic identity is infrastructure test data, not an authentication
// implementation or a claim about a real platform role.
export const mockIdentity: Identity = {
  displayName: '林晓',
  capabilities: new Set<Capability>([
    'overview:view',
    'resources:view',
    'topology:view',
    'drafts:edit',
  ]),
}

export function can(identity: Identity, capability: Capability) {
  return identity.capabilities.has(capability)
}
