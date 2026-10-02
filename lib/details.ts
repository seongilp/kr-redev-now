import 'server-only';

import bidsRaw from '@/data/bids.json';
import partnersRaw from '@/data/partners.json';
import projectsRaw from '@/data/projects.json';
import type { Bid, Partner, Project, ZoneDetail } from '@/lib/types';

const PROJECTS = projectsRaw as unknown as Project[];
const BY_ID = new Map(PROJECTS.map((p) => [p.id, p]));
const BIDS = bidsRaw as unknown as Record<string, Bid[]>;
const PARTNERS = partnersRaw as unknown as Record<string, Partner[]>;

/** 상세 패널에 보여 줄 최근 공고 수 */
const BID_LIMIT = 10;

/** 구역 하나의 상세 — 통계(단계별 날짜·세대수)·입찰공고·협력업체. 매칭 안 된 항목은 비어 있다. */
export function zoneDetail(statId: string | null, bizNos: readonly string[]): ZoneDetail {
  const bids = bizNos
    .flatMap((b) => BIDS[b] ?? [])
    .sort((a, b) => (b.pbanc ?? '').localeCompare(a.pbanc ?? ''))
    .slice(0, BID_LIMIT);
  const partners = bizNos.flatMap((b) => PARTNERS[b] ?? []);
  return { project: statId ? BY_ID.get(statId) ?? null : null, bids, partners };
}

