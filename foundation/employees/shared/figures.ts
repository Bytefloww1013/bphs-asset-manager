// Words for the figures other modules give on an employee's row (`EmployeeFigures`), shared by the page and the servers that give them.

/** What keeps an employee from being archived on the review side: "the reviewer on 1 open review and responsible for 2 open CAPs". */
export function openReviewWork(reviewing: number, caps: number) {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  return [
    reviewing && `the reviewer on ${count(reviewing, 'open review')}`,
    caps && `responsible for ${count(caps, 'open CAP')}`,
  ]
    .filter(Boolean)
    .join(' and ')
}
