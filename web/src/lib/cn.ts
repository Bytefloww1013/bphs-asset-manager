import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `text-md` is our own font-size step; tell the merger it is a size, not a colour.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ['md'] } } })

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
