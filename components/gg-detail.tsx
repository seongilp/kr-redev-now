import { ExternalLink, MapPin, X } from 'lucide-react';

import { StageBar } from '@/components/stage-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GG_KIND_COLORS } from '@/lib/categories';
import type { GgProject } from '@/lib/types';

const DATE_LABELS: [string, string][] = [
  ['zoneDesignation', '구역지정'],
  ['committee', '추진위 구성'],
  ['association', '조합설립인가'],
  ['archReview', '건축심의'],
  ['bizImpl', '사업시행인가'],
  ['mgmtDisposition', '관리처분인가'],
  ['construction', '착공'],
  ['completion', '준공'],
];

const num = (v: string | number | undefined) => (v === undefined || v === '' ? '—' : Number(v).toLocaleString());

export function GgDetailPanel({ p, onClose }: { p: GgProject; onClose: () => void }) {
  const dates = DATE_LABELS.filter(([k]) => p.dates?.[k as keyof NonNullable<GgProject['dates']>]);
  const q = encodeURIComponent(p.addr || p.name);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Badge style={{ backgroundColor: GG_KIND_COLORS[p.kind] }} className="text-white">
              {p.type || p.kind}
            </Badge>
            <Badge variant="outline">{p.gu}</Badge>
          </div>
          <h2 className="text-lg font-bold leading-snug">{p.name}</h2>
          {p.area && (
            <p className="text-sm text-muted-foreground">
              면적 {Math.round(p.area).toLocaleString()}㎡ (약 {Math.round(p.area / 3.3058).toLocaleString()}평)
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
          <X className="size-4" />
        </Button>
      </div>

      {p.addr && (
        <p className="flex gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {p.addr}
          {p.lat === null && <span className="text-xs text-muted-foreground">(위치 변환 실패 — 지도에 없음)</span>}
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          추진단계 <span className="text-primary">{p.stage || '정보 없음'}</span>
        </h3>
        <StageBar stage={p.stage} />
      </section>

      {p.households && Object.keys(p.households).length > 0 && (
        <dl className="grid grid-cols-4 gap-2 rounded-2xl bg-[var(--brand-soft)] p-3 text-center">
          {[
            ['기존 세대', p.households.existing],
            ['건립 세대', p.households.total],
            ['분양', p.households.sale],
            ['임대', p.households.rent],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="font-semibold tabular-nums">{num(v as string | number | undefined)}</dd>
            </div>
          ))}
        </dl>
      )}

      {dates.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">진행 이력</h3>
          <ol className="space-y-1 border-l-2 border-[#E5E8EB] pl-3 text-sm">
            {dates.map(([k, label]) => (
              <li key={k} className="flex justify-between gap-3">
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">{p.dates?.[k as keyof NonNullable<GgProject['dates']>]}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {p.extra && Object.keys(p.extra).length > 0 && (
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {Object.entries(p.extra).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <Button asChild variant="outline" size="sm">
        <a href={`https://map.kakao.com/?q=${q}`} target="_blank" rel="noreferrer">
          <ExternalLink className="size-4" /> 카카오맵에서 위치 보기
        </a>
      </Button>
      <p className="text-xs text-muted-foreground">
        출처: 경기도 {p.kind === '정비사업' ? '일반 정비사업 추진 현황' : '소규모 주택정비사업 정보'}(경기데이터드림). 경기도는 구역 경계 데이터가 없어 주소 위치를 점으로 표시합니다.
      </p>
    </div>
  );
}
