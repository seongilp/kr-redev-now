/** 사업 대분류 색 — 지도 면 색과 칩 색을 한 곳에서 정한다 */
export const CATEGORIES = [
  { name: '정비사업', label: '재개발·재건축', color: '#3182F6' },
  { name: '재정비촉진사업', label: '재정비촉진(뉴타운)', color: '#8B5CF6' },
  { name: '소규모 정비사업', label: '모아타운·가로주택', color: '#10B981' },
  { name: '역세권사업', label: '역세권·청년주택', color: '#F59E0B' },
  { name: '국토부사업', label: '공공주택(국토부)', color: '#EF4444' },
  { name: '기타사업', label: '도시개발·리모델링 등', color: '#64748B' },
] as const;

export const FALLBACK_COLOR = '#94A3B8';

export function categoryColor(cat: string): string {
  return CATEGORIES.find((c) => c.name === cat.trim())?.color ?? FALLBACK_COLOR;
}

/** 지도 fill-color 용 maplibre match 식 */
export function colorExpression(): unknown[] {
  return ['match', ['get', 'cat'], ...CATEGORIES.flatMap((c) => [c.name, c.color]), FALLBACK_COLOR];
}

/**
 * 재개발·재건축 표준 단계. 상세 패널의 진행 막대에 쓴다.
 * 사업유형마다 단계 이름이 조금씩 달라(가로주택은 관리처분이 없다) 이 목록에 있는 단계만 막대로 그린다.
 */
export const REDEV_STAGES = [
  '구역지정',
  '추진위구성',
  '조합설립인가',
  '건축심의',
  '사업시행인가',
  '관리처분계획인가',
  '착공',
  '준공',
] as const;

export function stageIndex(stage: string): number {
  const compact = stage.replace(/\s/g, '');
  // '조합설립추진중'처럼 단계명이 붙어 쓰인 경우도 잡는다
  const idx = REDEV_STAGES.findIndex((s) => compact.includes(s) || compact.includes(s.replace(/인가$/, '')));
  // '조합설립인가 추진중' = 아직 인가 전 → 바로 앞 단계까지만
  if (idx > 0 && compact.includes('추진중')) return idx - 1;
  return idx;
}
