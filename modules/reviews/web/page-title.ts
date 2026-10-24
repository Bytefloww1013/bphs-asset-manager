import { usePageTitle } from '@/lib/session.ts'

/** The tab title in the Administrative Reviews workspace: "Administrative Reviews · BPHS-Connect", or the page's own name in front of that. */
export function useReviewPageTitle(page?: string) {
  usePageTitle(page ? `${page} · Administrative Reviews` : 'Administrative Reviews')
}
