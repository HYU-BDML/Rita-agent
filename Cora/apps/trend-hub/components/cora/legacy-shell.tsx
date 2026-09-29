'use client';
import { usePathname } from 'next/navigation';
export function LegacyShell({ children, legacy }: {children: React.ReactNode; legacy: React.ReactNode}) { const path=usePathname();return path?.startsWith('/studio') ? <>{children}</> : <>{legacy}</>; }
