# 재개발나우 (kr-redev-now)

서울 재개발·재건축·재정비촉진·모아타운·가로주택 등 정비구역 2,776곳을 지도에서 보고, 구역별 추진단계·진행 이력·세대수·조합 입찰공고·협력업체를 확인한다.

- 배포: https://kr-redev-now.vercel.app
- 런타임 외부 API 호출 없음 — `data/` 정적 스냅샷. 갱신: `npm run collect` → 커밋 → 배포(env `SEOUL_API_KEY` 는 수집 때만).

| 데이터 | 출처(서울 열린데이터광장) |
|---|---|
| 구역 폴리곤·사업유형·추진단계 | OA-22712 도시계획사업 현황(서울플랜+) SHP — Bessel TM → WGS84 |
| 단계별 날짜·세대수 | OA-22856 도시정비사업 통계 `TbSeoulRedevStatus` (구역명 매칭 97%) |
| 조합 입찰공고 | OA-2252 `ListCombinationBidding` (조합명 매칭 48%) |
| 협력업체 | OA-2255 `CleanupPartnersInfo` |
