import type { RefObject } from 'react'
import { MultiCombobox } from '@/components/ui/combobox.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import type { EmployeeRow } from '@shared/types.ts'

interface PeoplePickerProps {
  employees: EmployeeRow[]
  value: EmployeeRow[]
  onChange: (value: EmployeeRow[]) => void
  /** People who cannot be offered here, such as those already in the grievance's other list. */
  exclude?: EmployeeRow[]
  placeholder?: string
  disabled?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

const getKey = (person: EmployeeRow) => person.id
// Someone archived since they were named is no longer offered, and says so where they still stand.
const getLabel = (person: EmployeeRow) => (person.state === 'archived' ? `${person.name} (archived)` : person.name)
const getSearch = (person: EmployeeRow) => person.code

/**
 * Picks several employees, by name or Employee ID. Only active employees are offered. Someone already chosen stays as a chip after
 * they are archived, so an old record still shows who was named.
 */
export function PeoplePicker({ employees, value, onChange, exclude, placeholder = 'Search by name or Employee ID', ...rest }: PeoplePickerProps) {
  const offered = employees.filter((person) => person.state === 'active' && !exclude?.some((other) => other.id === person.id))
  return (
    <MultiCombobox
      items={offered}
      value={value}
      onChange={onChange}
      getKey={getKey}
      getLabel={getLabel}
      getSearch={getSearch}
      renderItem={(person) => (
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium">{person.name}</span>
          <span className="shrink-0 text-xs text-ink-3">
            <Mono>{person.code}</Mono>
            {person.department ? ` · ${person.department}` : ''}
          </span>
        </span>
      )}
      emptyText="No active employee matches"
      placeholder={placeholder}
      {...rest}
    />
  )
}
