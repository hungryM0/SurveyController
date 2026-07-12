export const WINDOW_EXIT_DURATION_MS = 160

export type PageMotion = 'page-motion-initial' | 'page-motion-forward' | 'page-motion-backward'

export function resolvePageMotion(previousPage: string, currentPage: string, pageOrder: string[]): PageMotion {
  if (previousPage === currentPage) {
    return 'page-motion-initial'
  }

  const previousIndex = pageOrder.indexOf(previousPage)
  const currentIndex = pageOrder.indexOf(currentPage)
  if (previousIndex < 0 || currentIndex < 0) {
    return 'page-motion-forward'
  }
  return currentIndex > previousIndex ? 'page-motion-forward' : 'page-motion-backward'
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function waitForWindowExit(): Promise<void> {
  if (prefersReducedMotion()) {
    return Promise.resolve()
  }
  return new Promise((resolve) => window.setTimeout(resolve, WINDOW_EXIT_DURATION_MS))
}
