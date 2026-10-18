'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface NavItem {
  href: string
  label: string
  badge?: number
}

function isActive(pathname: string, href: string): boolean {
  return href === '/app' ? pathname === '/app' : pathname === href || pathname.startsWith(`${href}/`)
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-[14.5px] font-medium transition-colors ${
              active ? 'bg-[var(--navy-2)] text-white' : 'text-[var(--navy-muted)] hover:bg-[var(--navy-2)] hover:text-white'
            }`}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-[var(--chart-2)] px-2 text-[12px] font-bold text-[var(--navy)]" aria-label={`${item.badge} pendentes`}>
                {item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
