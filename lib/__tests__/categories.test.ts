import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FALLBACK_COLOR, categoryColor, stageIndex } from '../categories';

test('추진단계 → 표준 단계 위치(재정비촉진 접두어·공백이 섞여도)', () => {
  assert.equal(stageIndex('구역지정'), 0);
  assert.equal(stageIndex('조합설립인가'), 2);
  assert.equal(stageIndex('관리처분계획인가'), 5);
  assert.equal(stageIndex('착공'), 6);
});

test('"추진중"은 아직 그 단계 전이다 — 바로 앞 단계까지만 채운다', () => {
  assert.equal(stageIndex('조합설립인가 추진중(연번부여)'), 1);
  assert.equal(stageIndex('조합설립추진중'), 1);
});

test('표준 단계에 없는 단계(신통기획·미리내집 등)는 -1 — 막대를 그리지 않는다', () => {
  assert.equal(stageIndex('기획완료'), -1);
  assert.equal(stageIndex('입주자 모집공고 완료'), -1);
});

test('대분류 색 — 끝 공백(원천 코드표 "재정비촉진사업 ")을 흡수하고, 모르는 분류는 회색', () => {
  assert.equal(categoryColor('재정비촉진사업 '), '#8B5CF6');
  assert.equal(categoryColor('모르는사업'), FALLBACK_COLOR);
});
