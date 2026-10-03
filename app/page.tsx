import Link from 'next/link';

import { GgBrowser } from '@/components/gg-browser';
import { RedevBrowser } from '@/components/redev-browser';

const REGIONS = [
  { key: 'seoul', label: '서울', sub: '구역 경계 2,776' },
  { key: 'gg', label: '경기', sub: '정비사업 위치' },
] as const;

export default async function Home({ searchParams }: PageProps<'/'>) {
  const region = (await searchParams).region === 'gg' ? 'gg' : 'seoul';
  return (
    <div className="space-y-3">
      <nav className="inline-flex gap-1 rounded-full bg-[#F2F4F6] p-1" aria-label="지역">
        {REGIONS.map((r) => (
          <Link
            key={r.key}
            href={r.key === 'seoul' ? '/' : '/?region=gg'}
            aria-current={region === r.key ? 'page' : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${region === r.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {r.label} <span className="text-xs font-normal text-muted-foreground">{r.sub}</span>
          </Link>
        ))}
      </nav>
      {region === 'gg' ? <GgBrowser /> : <RedevBrowser />}
    </div>
  );
}
