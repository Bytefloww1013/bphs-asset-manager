export const CONDITION_KINDS = ['intake', 'issue', 'return'] as const
export type ConditionKind = (typeof CONDITION_KINDS)[number]

export const ASSET_STATUSES = ['in_service', 'retired'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

/** A condition rating's score runs from 1 to 100; 100 is as good as new. */
export const RATING_SCORE_MIN = 1
export const RATING_SCORE_MAX = 100
/** Ratings scoring below this need attention: they are red, and their assets are on the dashboard's condition watch. */
export const RATING_ATTENTION_BELOW = 50
/** The rating offered by default is the one whose score is closest to this ("Good" on the starting scale). */
export const RATING_DEFAULT_SCORE = 80

export type RatingBand = 'new' | 'good' | 'worn' | 'attention'

/** The band a score falls in. The bands are fixed so that red always means "on the condition watch". */
export function ratingBand(score: number): RatingBand {
  if (score >= 90) return 'new'
  if (score >= 70) return 'good'
  if (score >= RATING_ATTENTION_BELOW) return 'worn'
  return 'attention'
}

/** The rating to start a form on: the one closest to RATING_DEFAULT_SCORE, the better of two that are equally close. */
export function defaultRating<T extends { score: number }>(ratings: readonly T[]): T | undefined {
  const distance = (rating: T) => Math.abs(rating.score - RATING_DEFAULT_SCORE)
  return ratings.reduce<T | undefined>(
    (best, rating) =>
      !best || distance(rating) < distance(best) || (distance(rating) === distance(best) && rating.score > best.score)
        ? rating
        : best,
    undefined,
  )
}

/** Assets out longer than this are flagged as overdue in the UI. */
export const OVERDUE_DAYS = 365
