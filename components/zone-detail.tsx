'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { REDEV_STAGES, categoryColor, stageIndex } from '@/lib/categories';
import type { DateKey, ZoneDetail, ZoneProps } from '@/lib/types';

const DATE_LABELS: [DateKey, string][] = [
  ['zoneDesignation', '구역지정'],
  ['committee', '추진위 구성'],
  ['association', '조합설립'],
  ['archReview', '건축심의'],
  ['bizImpl', '사업시행인가'],
  ['mgmtDisposition', '관리처분인가'],
  ['migrationStart', '이주 시작'],
  ['migrationEnd', '이주 종료'],
  ['construction', '착공'],
];

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; detail: ZoneDetail };

export function ZoneDetailPanel({ zone, onClose }: { zone: ZoneProps; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const hasJoin = !!zone.statId || zone.bizNos.length > 0;

  useEffect(() => {
    if (!hasJoin) return;
    let alive = true;
    const qs = new URLSearchParams({ stat: zone.statId ?? '', biz: zone.bizNos.join(',') });
    fetch(`/api/zone?${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<ZoneDetail>) : Promise.reject(new Error(String(r.status)))))
      .then((detail) => alive && setState({ kind: 'ready', detail }))
      .catch((err) => {
        console.error('[zone] detail failed', zone.id, err);
        if (alive) setState({ kind: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [zone.id, zone.statId, zone.bizNos, hasJoin]);

  const idx = stageIndex(zone.stage);
  const p = state.kind === 'ready' ? state.detail.project : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Badge style={{ backgroundColor: categoryColor(zone.cat) }} className="text-white">
              {zone.type || zone.cat}
            </Badge>
            <Badge variant="outline">{zone.gu}</Badge>
          </div>
          <h2 className="text-lg font-bold leading-snug">{zone.name}</h2>
          <p className="text-sm text-muted-foreground">
            면적 {Math.round(zone.area).toLocaleString()}㎡ (약 {Math.round(zone.area / 3.3058).toLocaleString()}평)
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
          <X className="size-4" />
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          추진단계 <span className="text-primary">{zone.stage || '정보 없음'}</span>
        </h3>
        {idx >= 0 && (
          <ol className="grid grid-cols-8 gap-1">
            {REDEV_STAGES.map((s, i) => (
              <li key={s} className="space-y-1">
                <div className={`h-1.5 rounded-full ${i <= idx ? 'bg-primary' : 'bg-[#E5E8EB]'}`} />
                <span className={`block text-[10px] leading-tight ${i === idx ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {hasJoin && state.kind === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 사업 상세 불러오는 중…
        </p>
      )}
      {state.kind === 'error' && <p className="text-sm text-destructive">사업 상세를 불러오지 못했습니다.</p>}

      {p && (
        <>
          {p.households && (
            <dl className="grid grid-cols-4 gap-2 rounded-2xl bg-[var(--brand-soft)] p-3 text-center">
              {[
                ['기존 세대', p.households.existing],
                ['건립 세대', p.households.total],
                ['분양', p.households.sale],
                ['임대', p.households.rent],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v ? Number(v).toLocaleString() : '—'}</dd>
                </div>
              ))}
            </dl>
          )}
          {p.dates && Object.keys(p.dates).length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">진행 이력</h3>
              <ol className="space-y-1 border-l-2 border-[#E5E8EB] pl-3 text-sm">
                {DATE_LABELS.filter(([k]) => p.dates?.[k]).map(([k, label]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span>{label}</span>
                    <span className="tabular-nums text-muted-foreground">{p.dates?.[k]}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            {[p.publicPrivate, p.generalPromoted, p.jibun && `${p.gu} ${p.jibun}`].filter(Boolean).join(' · ')}
          </p>
        </>
      )}

      {state.kind === 'ready' && state.detail.bids.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">최근 조합 입찰공고</h3>
          <ul className="divide-y divide-[#F2F4F6] text-sm">
            {state.detail.bids.map((b, i) => (
              <li key={i} className="py-2">
                <p className="font-medium leading-snug">{b.ttl}</p>
                <p className="text-xs text-muted-foreground">
                  공고 {b.pbanc}
                  {b.expiry ? ` · 마감 ${b.expiry}` : ''}
                  {b.method ? ` · ${b.method}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.kind === 'ready' && state.detail.partners.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">협력업체</h3>
          <ul className="space-y-1 text-sm">
            {state.detail.partners.map((pt, i) => (
              <li key={i} className={`flex justify-between gap-3 ${pt.cancelled ? 'text-muted-foreground line-through' : ''}`}>
                <span className="text-muted-foreground">{pt.cls}</span>
                <span className="text-right">{pt.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasJoin && (
        <p className="rounded-xl bg-[#F9FAFB] p-3 text-xs text-muted-foreground">
          이 구역은 정비사업 통계·입찰공고와 이름이 연결되지 않아 지도 정보(유형·단계·면적)만 보여 줍니다.
        </p>
      )}

      <Button asChild variant="outline" size="sm">
        <a href="https://cleanup.seoul.go.kr" target="_blank" rel="noreferrer">
          <ExternalLink className="size-4" /> 정비사업 정보몽땅에서 더 보기
        </a>
      </Button>
      <p className="text-xs text-muted-foreground">
        출처: 서울특별시 도시계획사업 현황(서울플랜+)·도시정비사업 통계·조합 입찰공고·협력업체 (서울 열린데이터광장)
      </p>
    </div>
  );
}
