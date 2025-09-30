import { useEffect, useRef, useState, useCallback } from 'react'

interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  triggerOnce?: boolean
  skip?: boolean
}

export function useIntersectionObserver<T extends HTMLElement = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
) {
  const {
    threshold = 0,
    rootMargin = '0px',
    triggerOnce = false,
    skip = false,
    ...otherOptions
  } = options

  const [isIntersecting, setIsIntersecting] = useState(false)
  const [hasIntersected, setHasIntersected] = useState(false)
  const targetRef = useRef<T>(null)

  const callback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      const isIntersectingNow = entry.isIntersecting

      setIsIntersecting(isIntersectingNow)

      if (isIntersectingNow && !hasIntersected) {
        setHasIntersected(true)
      }
    },
    [hasIntersected]
  )

  useEffect(() => {
    const node = targetRef.current
    if (!node || skip) return

    const observer = new IntersectionObserver(callback, {
      threshold,
      rootMargin,
      ...otherOptions
    })

    observer.observe(node)

    return () => {
      observer.unobserve(node)
    }
  }, [callback, threshold, rootMargin, skip, otherOptions])

  // If triggerOnce is true, return hasIntersected instead of isIntersecting
  const shouldTrigger = triggerOnce ? hasIntersected : isIntersecting

  return {
    ref: targetRef,
    isIntersecting: shouldTrigger,
    hasIntersected
  }
}

// Hook for lazy loading components based on viewport visibility
export function useLazyComponent<T extends HTMLElement = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
) {
  const { ref, isIntersecting, hasIntersected } = useIntersectionObserver<T>({
    triggerOnce: true,
    rootMargin: '100px', // Start loading 100px before element comes into view
    ...options
  })

  return {
    ref,
    shouldLoad: isIntersecting || hasIntersected,
    isVisible: isIntersecting
  }
}

// Hook for virtualization and performance optimization
export function useVirtualization<T extends HTMLElement = HTMLDivElement>(
  itemHeight: number,
  containerHeight: number,
  items: any[],
  overscan: number = 3
) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<T>(null)

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  )

  const visibleItems = items.slice(startIndex, endIndex + 1)
  const totalHeight = items.length * itemHeight
  const offsetY = startIndex * itemHeight

  return {
    ref: containerRef,
    visibleItems,
    startIndex,
    endIndex,
    totalHeight,
    offsetY,
    scrollTop
  }
}