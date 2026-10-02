import { NextResponse } from 'next/server';

import { zoneDetail } from '@/lib/details';

/**
 * 구역 상세. 지도 데이터(zones.geojson)에 이미 있는 statId·bizNos 를 쿼리로 받아 조인 결과만 돌려준다.
 * 원천은 빌드에 묶인 정적 스냅샷이라 하루 캐시해도 된다.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const statId = sp.get('stat');
  const bizNos = (sp.get('biz') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[\w-]{1,40}$/.test(s))
    .slice(0, 20);
  const detail = zoneDetail(statId && /^\d{1,8}$/.test(statId) ? statId : null, bizNos);
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
}
