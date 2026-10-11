import { useNavigate } from '@tanstack/react-router'

/** Open the Issue or Return sheet from anywhere; they are driven by the URL so they can be linked to. */
export function useSheetActions() {
  const navigate = useNavigate()
  return {
    issue: (assetId?: number, employeeId?: number) =>
      void navigate({ to: '.', search: ((prev: Record<string, unknown>) => ({ ...prev, issue: assetId ?? 'new', employee: employeeId })) as never }),
    returnAsset: (assignmentId: number) =>
      void navigate({ to: '.', search: ((prev: Record<string, unknown>) => ({ ...prev, return: assignmentId })) as never }),
  }
}
