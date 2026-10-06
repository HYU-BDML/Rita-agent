import { Studio } from '@/components/cora/studio';
import { productMode } from '@/lib/cora/release';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cora · 콘텐츠 제작실' };
export default function Page() { return <Studio productMode={productMode()} />; }
