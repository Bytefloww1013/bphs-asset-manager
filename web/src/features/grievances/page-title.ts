import { usePageTitle } from '@/lib/session.ts'

/** The tab title in the Grievances workspace: "Grievances · BPHS", or the page's own name in front of that. */
export function useGrievancePageTitle(page?: string) {
  usePageTitle(page ? `${page} · Grievances` : 'Grievances', 'BPHS')
}
