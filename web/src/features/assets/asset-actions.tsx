import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { Eye, Pencil, RotateCcw, Trash2, Archive } from 'lucide-react'
import { useState } from 'react'
import { SUPER_ADMIN_ONLY } from '@shared/permissions.ts'
import { assetUpdateSchema } from '@shared/schemas.ts'
import type { AssetRow } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Input, Select } from '@/components/ui/form.tsx'
import { ConfirmDialog, Menu, Sheet, type MenuItem } from '@/components/ui/overlay.tsx'
import { useQuery } from '@tanstack/react-query'
import { useSheetActions } from '@/features/assignments/open.ts'
import { useWrite } from '@/features/common/hooks.ts'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError, fieldMessages } from '@/lib/form.ts'
import { lookupsQuery } from '@/lib/queries.ts'
import { useCan } from '@/lib/session.ts'

/** The row's main action plus an overflow menu; owns the edit sheet and confirmation dialogs. */
export function AssetRowActions({ asset, onDeleted, onSaved, hidePrimary }: { asset: AssetRow; onDeleted?: () => void; onSaved?: (row: AssetRow) => void; hidePrimary?: boolean }) {
  const sheets = useSheetActions()
  const navigate = useNavigate()
  const canDelete = useCan('record.delete')
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'retire' | 'delete' | null>(null)

  const retire = useWrite(() => api.post(`/assets/${asset.id}/retire`), { success: `${asset.tag} retired` })
  const reinstate = useWrite(() => api.post(`/assets/${asset.id}/reinstate`), { success: `${asset.tag} reinstated` })
  const remove = useWrite(() => api.delete(`/assets/${asset.id}`), { success: `${asset.tag} deleted`, onSuccess: () => onDeleted?.() })

  const items: MenuItem[] = [
    { label: 'View details', icon: Eye, onSelect: () => void navigate({ to: '/assets/$tag', params: { tag: asset.tag } }) },
    { label: 'Edit details', icon: Pencil, onSelect: () => setEditing(true) },
    asset.state === 'retired'
      ? { label: 'Reinstate', icon: RotateCcw, onSelect: () => reinstate.mutate(undefined) }
      : {
          label: 'Retire',
          icon: Archive,
          onSelect: () => setConfirm('retire'),
          disabledReason: asset.state === 'assigned' ? `Assigned to ${asset.holder?.name}. Return it first.` : undefined,
        },
    {
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => setConfirm('delete'),
      disabledReason: !canDelete ? SUPER_ADMIN_ONLY : asset.hasHistory ? 'Has assignment history. Retire it instead; history is never deleted.' : undefined,
    },
  ]

  return (
    <div className="flex items-center justify-end gap-1.5">
      {!hidePrimary &&
        (asset.state === 'assigned' ? (
          <Button size="sm" onClick={() => asset.assignmentId && sheets.returnAsset(asset.assignmentId)}>
            Return
          </Button>
        ) : asset.state === 'in_storage' ? (
          <Button size="sm" onClick={() => sheets.issue(asset.id)}>
            Issue
          </Button>
        ) : (
          <Button size="sm" onClick={() => reinstate.mutate(undefined)} loading={reinstate.isPending}>
            Reinstate
          </Button>
        ))}
      <Menu label={`More actions for ${asset.tag}`} items={items} />

      {editing && <AssetEditSheet asset={asset} onSaved={onSaved} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirm === 'retire'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Retire ${asset.tag}?`}
        description="It leaves the available list and can no longer be issued. Its history stays, and you can reinstate it later."
        confirmLabel="Retire asset"
        onConfirm={() => retire.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete ${asset.tag}?`}
        description="This permanently removes the asset and its intake condition record. It has never been assigned, so no history is lost. This is written to the audit log."
        confirmLabel="Delete asset"
        tone="danger"
        onConfirm={() => remove.mutateAsync(undefined)}
      />
    </div>
  )
}

/** `onSaved` gets the row as the server stored it, so a caller can follow a renamed tag. */
export function AssetEditSheet({ asset, onSaved, onClose }: { asset: AssetRow; onSaved?: (row: AssetRow) => void; onClose: () => void }) {
  const { data: lookups } = useQuery(lookupsQuery)
  const types = lookups?.assetTypes ?? []
  const [error, setError] = useState<ApiError | null>(null)
  const save = useWrite((body: { tag?: string; typeId: number; serial: string }) => api.patch<AssetRow>(`/assets/${asset.id}`, body), { silent: true, success: (row) => `${row.tag} updated` })
  // A tag that was not edited is not sent, so an asset tagged before a rule existed (BPHS/01) can still have its type and serial corrected.
  const changes = (value: { tag: string; typeId: string; serial: string }) => ({
    ...(value.tag.trim().toUpperCase() === asset.tag.toUpperCase() ? {} : { tag: value.tag }),
    typeId: Number(value.typeId),
    serial: value.serial,
  })

  const form = useForm({
    defaultValues: { tag: asset.tag, typeId: String(asset.typeId), serial: asset.serial ?? '' },
    validators: {
      onSubmit: ({ value }) => {
        const checked = assetUpdateSchema.safeParse(changes(value))
        return checked.success ? undefined : { fields: fieldMessages(checked.error) }
      },
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const row = await save.mutateAsync(changes(value))
        onSaved?.(row)
        onClose()
      } catch (e) {
        if (e instanceof ApiError) setError(e)
      }
    },
  })
  const submitted = form.state.submissionAttempts > 0
  // A message about one of the three fields is shown under it; the alert is for anything else the server said.
  const inline = !!error && (!!error.fields.tag || !!error.fields.typeId || !!error.fields.serial)

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${asset.tag}`}
      description="Changes are written to the audit log. Condition and assignments are not edited here."
      footer={
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" form="asset-edit-form" loading={submitting}>
                Save changes
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <form
        id="asset-edit-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        {error && !inline && (
          <Alert tone="bad" title="Could not save">
            {error.message}
          </Alert>
        )}
        <form.Field name="tag">
          {(field) => (
            <Field label="Asset tag" error={fieldError(field, error?.fields, submitted)}>
              <Input mono autoFocus value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
            </Field>
          )}
        </form.Field>
        <form.Field name="typeId">
          {(field) => (
            <Field label="Type" error={fieldError(field, error?.fields, submitted)}>
              <Select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)}>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
                {!types.some((type) => type.id === asset.typeId) && <option value={asset.typeId}>{asset.type} (inactive)</option>}
              </Select>
            </Field>
          )}
        </form.Field>
        <form.Field name="serial">
          {(field) => (
            <Field label="Serial number" optional error={fieldError(field, error?.fields, submitted)}>
              <Input mono value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      </form>
    </Sheet>
  )
}
