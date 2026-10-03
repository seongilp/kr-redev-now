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

/** 표준 단계명과 다르게 적는 표기(경기도·소규모정비) → 표준 단계 */
const STAGE_ALIASES: [RegExp, (typeof REDEV_STAGES)[number]][] = [
  [/관리처분/, '관리처분계획인가'],
  [/사업시행/, '사업시행인가'],
  [/추진위/, '추진위구성'],
  [/조합설립/, '조합설립인가'],
  [/^정비구역|구역지정/, '구역지정'],
  // 준공 뒤 절차(이전고시·청산)는 막대에선 준공으로 본다
  [/준공|이전고시|청산/, '준공'],
];

export function stageIndex(stage: string): number {
  const compact = stage.replace(/\s/g, '');
  let idx = REDEV_STAGES.findIndex((s) => compact.includes(s));
  if (idx < 0) {
    const alias = STAGE_ALIASES.find(([re]) => re.test(compact))?.[1];
    idx = alias ? REDEV_STAGES.indexOf(alias) : -1;
  }
  // '조합설립인가 추진중' = 아직 인가 전 → 바로 앞 단계까지만
  if (idx > 0 && compact.includes('추진중')) return idx - 1;
  return idx;
}

/** 경기 점 지도 색 — 서울과 같은 계열(재개발·재건축 파랑, 소규모 초록) */
export const GG_KIND_COLORS: Record<'정비사업' | '소규모정비', string> = {
  정비사업: '#3182F6',
  소규모정비: '#10B981',
};
