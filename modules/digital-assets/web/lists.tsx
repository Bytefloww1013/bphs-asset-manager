import { useQuery } from '@tanstack/react-query'
import { nameListColumns, NameList } from '#modules/assets/web/index.ts'
import type { ListKind } from '@/components/list-parts.tsx'
import type { ListEditor } from '@/modules.ts'
import { digitalAssetTypesQuery } from './queries.ts'

// The digital asset types' editor on the Lookup lists page, after the physical asset types and brands.

// Guarded by Assets, like the physical lists; its changes are written to the audit log.
const DIGITAL_TYPES: ListKind = { path: 'digital-asset-types', section: 'assets', noun: 'type', log: 'audit log' }

const digitalTypeColumns = nameListColumns(DIGITAL_TYPES, 'Digital assets', 'digital assets')

function DigitalAssetTypes() {
  const { data = [] } = useQuery(digitalAssetTypesQuery)
  return (
    <NameList
      kind={DIGITAL_TYPES}
      rows={data}
      columns={digitalTypeColumns}
      title="Digital asset types"
      plural="types"
      placeholder="New digital type name"
      noun="Digital type"
    />
  )
}

export const digitalAssetTypesEditor: ListEditor = {
  key: 'digital-asset-types',
  component: DigitalAssetTypes,
  load: (queryClient) => queryClient.ensureQueryData(digitalAssetTypesQuery),
}
