/** `data/zones.geojson` 의 feature.properties — scripts/collect.py 가 만든다. */
export interface ZoneProps {
  id: string;
  name: string;
  gu: string;
  /** 사업 대분류: 정비사업 / 소규모 정비사업 / 역세권사업 / 재정비촉진사업 / 국토부사업 / 기타사업 */
  cat: string;
  /** 사업 소분류: 재개발(주택정비형), 가로주택정비사업 … */
  type: string;
  /** 추진단계 한글: 조합설립인가, 관리처분계획인가 … */
  stage: string;
  stageCode: string;
  area: number;
  lat: number;
  lng: number;
  /** 매칭된 정비사업 통계(TbSeoulRedevStatus) 일련번호 */
  statId: string | null;
  /** 매칭된 클린업시스템 사업번호(입찰공고·협력업체 조인키) */
  bizNos: string[];
}

export interface Project {
  id: string;
  zoneId: string | null;
  name: string;
  gu: string;
  jibun?: string;
  road?: string;
  publicPrivate?: string;
  generalPromoted?: string;
  type?: string;
  stage?: string;
  households?: { existing?: string; total?: string; sale?: string; rent?: string };
  dates?: Partial<Record<DateKey, string>>;
}

export type DateKey =
  | 'zoneDesignation'
  | 'committee'
  | 'association'
  | 'archReview'
  | 'bizImpl'
  | 'mgmtDisposition'
  | 'migrationStart'
  | 'migrationEnd'
  | 'construction';

export interface Bid {
  ttl: string;
  asct: string;
  pbanc: string;
  bidNm?: string;
  expiry?: string;
  method?: string;
}

export interface Partner {
  cls: string;
  name: string;
  cancelled: boolean;
}

export interface ZoneDetail {
  project: Project | null;
  bids: Bid[];
  partners: Partner[];
}
