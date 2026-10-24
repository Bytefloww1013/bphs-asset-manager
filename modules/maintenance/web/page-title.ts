import { usePageTitle } from '@/lib/session.ts'

/** The tab title in the Maintenance workspace: "Maintenance · BPHS-Connect", or the page's own name in front of that. */
export function useMaintenancePageTitle(page?: string) {
  usePageTitle(page ? `${page} · Maintenance` : 'Maintenance')
}
