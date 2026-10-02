'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { ZoneDetailPanel } from '@/components/zone-detail';
import type { FlyTarget } from '@/components/zone-map';
import { CATEGORIES, categoryColor } from '@/lib/categories';
import type { ZoneProps } from '@/lib/types';

const ZoneMap = dynamic(() => import('@/components/zone-map').then((m) => m.ZoneMap), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> 지도 불러오는 중…
    </div>
  ),
});

const LIST_LIMIT = 200;
const ALL_GU = '전체';

type DataState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; fc: GeoJSON.FeatureCollection; zones: ZoneProps[] };

export function RedevBrowser() {
  const [data, setData] = useState<DataState>({ kind: 'loading' });
  const [cats, setCats] = useState<ReadonlySet<string>>(() => new Set(['정비사업', '재정비촉진사업']));
  const [gu, setGu] = useState(ALL_GU);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const flyKey = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch('/data/zones.geojson')
      .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : Promise.reject(new Error(String(r.status)))))
      .then((fc) => {
        if (!alive) return;
        const zones = fc.features.map((f) => f.properties as ZoneProps);
        setData({ kind: 'ready', fc, zones });
      })
      .catch((err) => {
        console.error('[zones] load failed', err);
        if (alive) setData({ kind: 'error' });
      });
    return () => {
      alive = false;
    };
  }, []);

  const zones = useMemo(() => (data.kind === 'ready' ? data.zones : []), [data]);
  const guList = useMemo(() => [ALL_GU, ...[...new Set(zones.map((z) => z.gu))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))], [zones]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return zones.filter(
      (z) =>
        cats.has(z.cat.trim()) &&
        (gu === ALL_GU || z.gu === gu) &&
        (!q || z.name.includes(q) || z.stage.includes(q) || z.type.includes(q)),
    );
  }, [zones, cats, gu, query]);

  const visibleIds = useMemo(() => filtered.map((z) => z.id), [filtered]);
  const list = useMemo(() => [...filtered].sort((a, b) => b.area - a.area).slice(0, LIST_LIMIT), [filtered]);
  const selected = selectedId ? zones.find((z) => z.id === selectedId) : undefined;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const z of zones) if (gu === ALL_GU || z.gu === gu) m.set(z.cat.trim(), (m.get(z.cat.trim()) ?? 0) + 1);
    return m;
  }, [zones, gu]);

  const select = (z: ZoneProps) => {
    setSelectedId(z.id);
    flyKey.current += 1;
    setFlyTo({ lat: z.lat, lng: z.lng, key: flyKey.current });
  };
  const toggleCat = (name: string) =>
    setCats((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    // 모바일: 조작부 → 지도 → 목록. 데스크톱: 왼쪽 조작부·목록, 오른쪽 지도(지도는 하나만).
    <div className="grid gap-3 lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[400px_1fr] lg:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const on = cats.has(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => toggleCat(c.name)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on ? 'border-transparent text-white' : 'border-[#E5E8EB] bg-white hover:border-primary/40'
                }`}
                style={on ? { backgroundColor: c.color } : undefined}
              >
                {!on && <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />}
                {c.label}
                <span className={`text-xs tabular-nums ${on ? 'text-white/80' : 'text-muted-foreground'}`}>{counts.get(c.name) ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <select
            value={gu}
            onChange={(e) => setGu(e.target.value)}
            className="h-10 rounded-lg border border-[#E5E8EB] bg-white px-3 text-sm"
            aria-label="자치구"
          >
            {guList.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="구역명·단계 — 예: 한남, 관리처분" className="h-10 pl-9" aria-label="구역 검색" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {data.kind === 'loading' ? '구역 불러오는 중…' : data.kind === 'error' ? '구역 데이터를 불러오지 못했습니다.' : `${filtered.length.toLocaleString()}개 구역 · 면적 큰 순`}
        </p>
      </div>

      <div className="h-[50dvh] overflow-hidden rounded-2xl border border-[#E5E8EB] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto">
        <ZoneMap
          data={data.kind === 'ready' ? data.fc : null}
          visibleIds={data.kind === 'ready' ? visibleIds : null}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          flyTo={flyTo}
        />
      </div>

      <ul className="divide-y divide-[#F2F4F6] rounded-2xl border border-[#E5E8EB] bg-white lg:col-start-1 lg:row-start-2 lg:overflow-y-auto">
        {data.kind === 'ready' && list.length === 0 && <li className="p-4 text-sm text-muted-foreground">조건에 맞는 구역이 없습니다.</li>}
        {list.map((z) => (
          <li key={z.id}>
            <button
              type="button"
              onClick={() => select(z)}
              className={`flex w-full items-start gap-3 p-3 text-left hover:bg-accent/60 ${z.id === selectedId ? 'bg-accent' : ''}`}
            >
              <span className="mt-1.5 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: categoryColor(z.cat) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{z.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {z.gu} · {z.type} · <span className="text-foreground">{z.stage}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t border-[#E5E8EB] bg-white p-5 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[400px] lg:rounded-3xl lg:border">
          <ZoneDetailPanel key={selected.id} zone={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}
