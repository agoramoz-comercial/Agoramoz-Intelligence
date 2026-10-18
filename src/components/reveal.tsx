'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Revela [data-reveal] uma vez ao entrar no ecrã; nunca deixa conteúdo escondido. */
export function RevealObserver() {
  const pathname = usePathname()
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'))
    if (targets.length === 0) return
    if (!('IntersectionObserver' in window)) {
      targets.forEach((element) => element.classList.add('is-in'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    )
    targets.forEach((element) => observer.observe(element))
    const safety = window.setTimeout(() => targets.forEach((element) => element.classList.add('is-in')), 2500)
    return () => {
      observer.disconnect()
      window.clearTimeout(safety)
    }
  }, [pathname])
  return null
}
