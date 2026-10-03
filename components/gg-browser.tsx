'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';

import { GgDetailPanel } from '@/components/gg-detail';
import { Input } from '@/components/ui/input';
import type { FlyTarget, MapPoint } from '@/components/point-map';
import { GG_KIND_COLORS } from '@/lib/categories';
import type { GgProject } from '@/lib/types';

const PointMap = dynamic(() => import('@/components/point-map').then((m) => m.PointMap), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> 지도 불러오는 중…
    </div>
  ),
});

const ALL = '전체';
const KINDS = ['정비사업', '소규모정비'] as const;
const KIND_LABEL: Record<GgProject['kind'], string> = { 정비사업: '재개발·재건축', 소규모정비: '가로주택·소규모' };
/** 경기도 한가운데쯤(수원) — 처음 화면 중심 */
const GG_CENTER = { lat: 37.41, lon: 127.12 };

type DataState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: GgProject[] };

export function GgBrowser() {
  const [data, setData] = useState<DataState>({ kind: 'loading' });
  const [kinds, setKinds] = useState<ReadonlySet<GgProject['kind']>>(() => new Set(KINDS));
  const [gu, setGu] = useState(ALL);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const flyKey = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch('/data/gg-projects.json')
      .then((r) => (r.ok ? (r.json() as Promise<GgProject[]>) : Promise.reject(new Error(String(r.status)))))
      .then((items) => alive && setData({ kind: 'ready', items: Array.isArray(items) ? items : [] }))
      .catch((err) => {
        console.error('[gg] load failed', err);
        if (alive) setData({ kind: 'error' });
      });
    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo(() => (data.kind === 'ready' ? data.items : []), [data]);
  // 시군명만(‘성남시 수정구’ → ‘성남시’)으로 묶어 고른다
  const city = (g: string) => g.split(' ')[0];
  const guList = useMemo(() => [ALL, ...[...new Set(items.map((p) => city(p.gu)))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return items.filter(
      (p) =>
        kinds.has(p.kind) &&
        (gu === ALL || city(p.gu) === gu) &&
        (!q || p.name.includes(q) || p.addr.includes(q) || p.stage.includes(q) || p.type.includes(q)),
    );
  }, [items, kinds, gu, query]);

  const points = useMemo<MapPoint[]>(
    () =>
      filtered
        .filter((p) => p.lat !== null && p.lng !== null)
        .map((p) => ({ id: p.id, lat: p.lat as number, lon: p.lng as number, title: p.name, color: GG_KIND_COLORS[p.kind] })),
    [filtered],
  );
  const noCoord = filtered.length - points.length;
  const list = useMemo(() => [...filtered].sort((a, b) => a.gu.localeCompare(b.gu, 'ko') || a.name.localeCompare(b.name, 'ko')), [filtered]);
  const selected = selectedId ? items.find((p) => p.id === selectedId) : undefined;

  const select = (p: GgProject) => {
    setSelectedId(p.id);
    if (p.lat === null || p.lng === null) return;
    flyKey.current += 1;
    setFlyTo({ lat: p.lat, lon: p.lng, zoom: 15, key: flyKey.current });
  };
  const toggleKind = (k: GgProject['kind']) =>
    setKinds((s) => {
      const next = new Set(s);
      if (next.has(k) && next.size > 1) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="grid gap-3 lg:h-[calc(100dvh-10rem)] lg:grid-cols-[400px_1fr] lg:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const on = kinds.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-transparent text-white' : 'border-[#E5E8EB] bg-white'}`}
                style={on ? { backgroundColor: GG_KIND_COLORS[k] } : undefined}
              >
                {KIND_LABEL[k]}
                <span className={`text-xs tabular-nums ${on ? 'text-white/80' : 'text-muted-foreground'}`}>{items.filter((p) => p.kind === k).length}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <select value={gu} onChange={(e) => setGu(e.target.value)} className="h-10 rounded-lg border border-[#E5E8EB] bg-white px-3 text-sm" aria-label="시군">
            {guList.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="구역명·주소·단계 — 예: 광명, 착공" className="h-10 pl-9" aria-label="경기 구역 검색" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {data.kind === 'loading'
            ? '불러오는 중…'
            : data.kind === 'error'
              ? '경기 데이터를 불러오지 못했습니다.'
              : `${filtered.length.toLocaleString()}곳${noCoord > 0 ? ` · 위치 변환 실패 ${noCoord}곳은 목록에만` : ''} · 경기도는 구역 경계 데이터가 없어 위치를 점으로 표시`}
        </p>
      </div>

      <div className="h-[50dvh] overflow-hidden rounded-2xl border border-[#E5E8EB] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto">
        <PointMap points={points} center={GG_CENTER} isUserLocation={false} selectedId={selectedId} onSelect={setSelectedId} flyTo={flyTo} />
      </div>

      <ul className="divide-y divide-[#F2F4F6] rounded-2xl border border-[#E5E8EB] bg-white lg:col-start-1 lg:row-start-2 lg:overflow-y-auto">
        {data.kind === 'ready' && list.length === 0 && <li className="p-4 text-sm text-muted-foreground">조건에 맞는 곳이 없습니다.</li>}
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => select(p)} className={`flex w-full items-start gap-3 p-3 text-left hover:bg-accent/60 ${p.id === selectedId ? 'bg-accent' : ''}`}>
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: GG_KIND_COLORS[p.kind] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.gu} · {p.type} · <span className="text-foreground">{p.stage}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t border-[#E5E8EB] bg-white p-5 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[400px] lg:rounded-3xl lg:border">
          <GgDetailPanel key={selected.id} p={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}
