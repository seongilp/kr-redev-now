#!/usr/bin/env python3
"""
경기도 정비사업 2종 수집기 (재개발나우 - 경기 확장).

입력 (네트워크, 재실행 가능):
  - 경기데이터드림 Sheet 다운로드 엔드포인트:
    https://data.gg.go.kr/portal/data/sheet/downloadSheetData.do
      ?infId=<서비스ID>&infSeq=1&downloadType=C
    * infId=S62GFEEN7JMLMA0PH6CF19108891 : 일반 정비 사업 추진 현황 (경기 31개 시군)
    * infId=13H5REOHIUBGL1CYYHSG35587037 : 소규모 주택정비사업 정보
    * CP949(MS949) 인코딩 CSV. UA/Referer 필요(없으면 WAF 429 차단).
    * 경기데이터드림 포털의 "데이터셋 상세" 화면(selectServicePage.do)은 조사 시점
      기준 서버사이드 렌더링이 중간에 끊기는 상태였고, 그 내부에서 호출하는
      구(舊) 그리드 API(/portal/data/sheet/selectSheetMeta.do 등)는
      "사이트 점검 중입니다"를 반환했다. 그러나 다운로드 전용 엔드포인트
      (downloadSheetData.do)는 점검 대상이 아니어서 그대로 살아있었다 — 이걸로 수집.
  - VWorld 주소→좌표 API(지오코딩, PARCEL/ROAD, 캐시 사용)

출력 (data/):
  - gg-projects.json

런타임에는 API를 호출하지 않는다. 이 스크립트만 네트워크를 쓴다.
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "scripts" / "raw" / "gg"
DATA_DIR = ROOT / "data"
ENV_PATH = Path.home() / ".env"
CACHE_PATH = RAW_DIR / "geocode-cache.json"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
TIMEOUT_SEC = 15
RETRIES = 3

GG_SHEET_URL = "https://data.gg.go.kr/portal/data/sheet/downloadSheetData.do"
DATASETS = {
    "general": {
        "infId": "S62GFEEN7JMLMA0PH6CF19108891",
        "kind": "정비사업",
        "raw": RAW_DIR / "gg_general_raw.csv",
    },
    "small": {
        "infId": "13H5REOHIUBGL1CYYHSG35587037",
        "kind": "소규모정비",
        "raw": RAW_DIR / "gg_small_raw.csv",
    },
}

GG_RANGE = {"lat": (36.9, 38.3), "lng": (126.3, 127.9)}


# ---------------------------------------------------------------------------
# 환경변수
# ---------------------------------------------------------------------------
def load_keys() -> dict[str, str]:
    env: dict[str, str] = {}
    with open(ENV_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    missing = [k for k in ("GG", "VWORLD") if not env.get(k)]
    if missing:
        raise SystemExit(f"{ENV_PATH} 에 {missing} 키가 없습니다.")
    return {"GG": env["GG"], "VWORLD": env["VWORLD"]}


# ---------------------------------------------------------------------------
# 경기데이터드림 Sheet CSV 다운로드
# ---------------------------------------------------------------------------
def fetch_sheet_csv(inf_id: str, raw_path: Path) -> list[dict]:
    if raw_path.exists():
        print(f"  [캐시 사용] {raw_path.name}", file=sys.stderr)
        raw_bytes = raw_path.read_bytes()
    else:
        url = (
            f"{GG_SHEET_URL}?infId={inf_id}&infSeq=1&downloadType=C"
        )
        referer = (
            "https://data.gg.go.kr/portal/data/service/selectServicePage.do"
            f"?infId={inf_id}&infSeq=1"
        )
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Referer": referer},
        )
        last_err = None
        raw_bytes = b""
        for attempt in range(1, RETRIES + 1):
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
                    raw_bytes = resp.read()
                if len(raw_bytes) < 100:
                    raise RuntimeError(f"응답이 너무 작음: {len(raw_bytes)}B")
                break
            except Exception as e:  # noqa: BLE001
                last_err = e
                print(f"  [재시도 {attempt}/{RETRIES}] {inf_id}: {e}", file=sys.stderr)
                time.sleep(1.5 * attempt)
        else:
            raise SystemExit(f"{inf_id} 다운로드 실패: {last_err}")
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_bytes(raw_bytes)

    text = raw_bytes.decode("cp949", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = [row for row in reader]
    return rows


# ---------------------------------------------------------------------------
# 주소 정제
# ---------------------------------------------------------------------------
def dedupe_leading_city(addr: str) -> str:
    # "경기도 군포시 군포시 금정동 ..." -> "경기도 군포시 금정동 ..."
    tokens = addr.split()
    out = []
    for t in tokens:
        if out and out[-1] == t:
            continue
        out.append(t)
    return " ".join(out)


def split_gu(sigungu: str) -> str:
    # "성남시수정구" -> "성남시 수정구"
    m = re.match(r"^(.+?시)(.+구)$", sigungu)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    return sigungu


def normalize_addr(addr: str) -> str:
    addr = addr.strip()
    if not addr.startswith("경기도"):
        addr = "경기도 " + addr
    addr = dedupe_leading_city(addr)
    addr = re.sub(r"\s+", " ", addr)
    return addr.strip()


def clean_addr_variants(addr: str) -> list[str]:
    """실패 시 순차적으로 시도할 정제 후보들."""
    variants = []
    a = addr

    # 괄호 제거
    a1 = re.sub(r"\([^)]*\)", "", a).strip()
    if a1 != a:
        variants.append(a1)

    # "외 n필지" 제거
    a2 = re.sub(r"외\s*\d*\s*필지", "", addr).strip()
    if a2 not in variants and a2 != addr:
        variants.append(a2)

    # "일원" 제거
    a3 = re.sub(r"일원\s*$", "", addr).strip()
    if a3 not in variants and a3 != addr:
        variants.append(a3)

    # "번지" 제거
    a4 = re.sub(r"번지", "", addr).strip()
    if a4 not in variants and a4 != addr:
        variants.append(a4)

    # 범위 "123-4~56" -> "123-4" (맨 앞 번지만)
    a5 = re.sub(r"(\d+(?:-\d+)?)\s*~\s*\d+(?:-\d+)?", r"\1", addr).strip()
    if a5 not in variants and a5 != addr:
        variants.append(a5)

    # 행정동(숫자 포함, 예: 철산2동/석수3동) -> 법정동(숫자 제거, 철산동/석수동)
    a6 = re.sub(r"([가-힣]+)\d+동(?=\s|$)", r"\1동", addr)
    if a6 not in variants and a6 != addr:
        variants.append(a6)

    # 위 조합(괄호+외필지+일원+번지+행정동 숫자 모두 제거)
    combo = addr
    combo = re.sub(r"\([^)]*\)", "", combo)
    combo = re.sub(r"외\s*\d*\s*필지", "", combo)
    combo = re.sub(r"일원\s*$", "", combo)
    combo = re.sub(r"번지", "", combo)
    combo = re.sub(r"(\d+(?:-\d+)?)\s*~\s*\d+(?:-\d+)?", r"\1", combo)
    combo = re.sub(r"([가-힣]+)\d+동(?=\s|$)", r"\1동", combo)
    combo = re.sub(r"\s+", " ", combo).strip()
    if combo not in variants and combo != addr:
        variants.append(combo)

    return [re.sub(r"\s+", " ", v).strip() for v in variants if v.strip()]


# ---------------------------------------------------------------------------
# VWorld 지오코딩
# ---------------------------------------------------------------------------
def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8"
    )


def in_gg_range(lat: float, lng: float) -> bool:
    la, lb = GG_RANGE["lat"]
    lo, hi = GG_RANGE["lng"]
    return la <= lat <= lb and lo <= lng <= hi


def vworld_try(addr: str, typ: str, key: str) -> tuple[float, float] | None:
    url = (
        "https://api.vworld.kr/req/address?service=address&request=getcoord"
        f"&version=2.0&crs=epsg:4326&format=json&type={typ}&key={key}"
        f"&address={urllib.parse.quote(addr)}"
    )
    for attempt in range(1, 3):
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                data = json.load(r)
            resp = data.get("response", {})
            if resp.get("status") == "OK":
                pt = resp["result"]["point"]
                lat, lng = float(pt["y"]), float(pt["x"])
                if in_gg_range(lat, lng):
                    return (lat, lng)
                return None
            return None
        except Exception:  # noqa: BLE001
            time.sleep(0.3 * attempt)
    return None


def geocode_one(addr: str, key: str) -> tuple[float, float] | None:
    base = normalize_addr(addr)
    for typ in ("PARCEL", "ROAD"):
        pt = vworld_try(base, typ, key)
        if pt:
            return pt
        time.sleep(0.05)

    for cand in clean_addr_variants(base):
        for typ in ("PARCEL", "ROAD"):
            pt = vworld_try(cand, typ, key)
            if pt:
                return pt
            time.sleep(0.05)

    return None


def geocode_all(addrs: list[str], key: str) -> dict[str, tuple[float, float] | None]:
    cache = load_cache()
    todo = [a for a in sorted(set(addrs)) if a not in cache]
    print(f"  지오코딩 대상 {len(set(addrs))}건 중 캐시 미존재 {len(todo)}건", file=sys.stderr)

    def work(addr: str):
        return addr, geocode_one(addr, key)

    done = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for addr, pt in ex.map(work, todo):
            cache[addr] = list(pt) if pt else None
            done += 1
            if done % 50 == 0:
                print(f"    ...{done}/{len(todo)}", file=sys.stderr)
                save_cache(cache)

    save_cache(cache)
    return {a: (tuple(cache[a]) if cache.get(a) else None) for a in addrs}


# ---------------------------------------------------------------------------
# 날짜/숫자 파싱
# ---------------------------------------------------------------------------
def ymd8(s: str) -> str | None:
    s = (s or "").strip()
    if re.fullmatch(r"\d{8}", s):
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return None


def mdy_slash(s: str) -> str | None:
    s = (s or "").strip()
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        mm, dd, yyyy = m.groups()
        return f"{yyyy}-{mm}-{dd}"
    return None


def to_num(s: str) -> float | int | None:
    s = (s or "").strip().replace(",", "")
    if not s:
        return None
    try:
        f = float(s)
        if f.is_integer():
            return int(f)
        return f
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# 데이터셋1: 일반 정비 사업 추진 현황
# ---------------------------------------------------------------------------
def build_general_projects(rows: list[dict]) -> list[dict]:
    out = []
    for idx, r in enumerate(rows, start=1):
        gu = r["시군명"].strip()
        name = r["정비구역명"].strip()
        addr = normalize_addr(r["위치"].strip())

        households = {}
        existing = to_num(r["(기존주택)세대수"])
        total = to_num(r["사업시행세대수총계"])
        sale = to_num(r["(신축주택)분양주택수"])
        rent = to_num(r["임대세대수"]) or to_num(r["(신축주택)임대주택수"])
        if existing is not None:
            households["existing"] = existing
        if total is not None:
            households["total"] = total
        if sale is not None:
            households["sale"] = sale
        if rent is not None:
            households["rent"] = rent

        dates = {}
        zone_date = ymd8(r["정비구역지정일자(최초지정)"]) or ymd8(r["정비구역지정일자(변경지정)"])
        if zone_date:
            dates["zoneDesignation"] = zone_date
        if ymd8(r["추진위승인일자"]):
            dates["committee"] = ymd8(r["추진위승인일자"])
        if ymd8(r["조합설립인가일자"]):
            dates["association"] = ymd8(r["조합설립인가일자"])
        if ymd8(r["사업시행인가일자"]):
            dates["bizImpl"] = ymd8(r["사업시행인가일자"])
        if ymd8(r["관리처분인가일자"]):
            dates["mgmtDisposition"] = ymd8(r["관리처분인가일자"])
        if ymd8(r["착공일자"]):
            dates["construction"] = ymd8(r["착공일자"])
        if ymd8(r["준공일자"]):
            dates["completion"] = ymd8(r["준공일자"])

        extra = {}
        if r["사업시행자"].strip():
            extra["시행자"] = r["사업시행자"].strip()
        if r["토지등소유자수(명)"].strip():
            extra["토지등소유자수"] = r["토지등소유자수(명)"].strip()
        if r["조합원수(명)"].strip():
            extra["조합원수"] = r["조합원수(명)"].strip()
        if r["(기존)용적률"].strip() or r["(신축)용적률"].strip():
            extra["용적률(기존/신축)"] = f"{r['(기존)용적률'].strip()} / {r['(신축)용적률'].strip()}"
        if r["(기존주택)준공년도"].strip():
            extra["기존주택준공년도"] = r["(기존주택)준공년도"].strip()
        if r["정비예정구역고시일자"].strip():
            extra["정비예정구역고시일자"] = ymd8(r["정비예정구역고시일자"]) or r["정비예정구역고시일자"].strip()
        if r["담당자전화번호"].strip():
            extra["담당자전화번호"] = r["담당자전화번호"].strip()
        if r["비고"].strip():
            extra["비고"] = r["비고"].strip()

        area = to_num(r["구역면적(㎡)"])

        out.append(
            {
                "id": f"gg-g{idx:04d}",
                "kind": "정비사업",
                "name": name,
                "gu": gu,
                "addr": addr,
                "lat": None,
                "lng": None,
                "type": r["사업유형"].strip(),
                "stage": r["사업단계"].strip(),
                "area": area,
                "households": households,
                "dates": dates,
                "extra": extra,
            }
        )
    return out


# ---------------------------------------------------------------------------
# 데이터셋2: 소규모 주택정비사업 정보
# ---------------------------------------------------------------------------
TYPE_CODE_MAP = {
    "1": "가로주택정비사업",
    "2": "자율주택정비사업",
    "3": "소규모재건축사업",
    "4": "소규모재개발사업",
    "5": "소규모재개발사업",
}


def build_small_projects(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        seq = r["연번"].strip() or None
        sigungu = split_gu(r["시군구"].strip())
        detail_addr = r["상세주소"].strip()
        addr = normalize_addr(f"{sigungu} {detail_addr}".strip())

        name = r["사업명"].strip()
        if not name:
            name = f"{sigungu} {detail_addr}".strip()

        type_label = TYPE_CODE_MAP.get(r["사업구분"].strip(), r["사업구분"].strip())
        if r["유형구분"].strip():
            type_label = f"{type_label}({r['유형구분'].strip()})"

        households = {}
        existing = to_num(r["기존세대수"])
        sale = to_num(r["공급일반"])
        rent_pub = to_num(r["공급공공임대"]) or 0
        rent_priv = to_num(r["공급공공지원민간임대"]) or 0
        rent = (rent_pub or 0) + (rent_priv or 0)
        owners_supply = to_num(r["공급토지등소유자"])
        total = None
        parts = [x for x in [owners_supply, sale, rent_pub, rent_priv] if x is not None]
        if parts:
            total = sum(parts)
        if existing is not None:
            households["existing"] = existing
        if total is not None:
            households["total"] = total
        if sale is not None:
            households["sale"] = sale
        if rent:
            households["rent"] = rent

        dates = {}
        if mdy_slash(r["추진위승인시기"]):
            dates["committee"] = mdy_slash(r["추진위승인시기"])
        assoc = mdy_slash(r["조합설립인가시기"]) or mdy_slash(r["주민합의체구성"])
        if assoc:
            dates["association"] = assoc
        if mdy_slash(r["건축심의시기"]):
            dates["archReview"] = mdy_slash(r["건축심의시기"])
        if mdy_slash(r["사업시행계획인가시기"]):
            dates["bizImpl"] = mdy_slash(r["사업시행계획인가시기"])
        if mdy_slash(r["착공시기"]):
            dates["construction"] = mdy_slash(r["착공시기"])
        if mdy_slash(r["준공시기"]):
            dates["completion"] = mdy_slash(r["준공시기"])

        extra = {}
        if r["사업시행자"].strip():
            extra["시행자"] = r["사업시행자"].strip()
        if r["용도지역"].strip():
            extra["용도지역"] = r["용도지역"].strip()
        if r["용적율"].strip():
            extra["용적률"] = r["용적율"].strip()
        if r["특례적용여부"].strip():
            extra["특례적용여부"] = r["특례적용여부"].strip()
        if r["총사업비"].strip() and r["총사업비"].strip() != "미정":
            extra["총사업비(억원)"] = r["총사업비"].strip()
        if r["광역지자체_담당"].strip():
            extra["광역지자체담당부서"] = f"{r['광역지가체_부서'].strip()} ({r['광역지자체_담당'].strip()})"
        if r["기초지자체_담당자"].strip():
            extra["기초지자체담당부서"] = f"{r['기초지자체_부서'].strip()} ({r['기초지자체_담당자'].strip()})"
        if r["뉴딜해당_여부"].strip() and r["뉴딜해당_여부"].strip() not in ("X", ""):
            extra["뉴딜해당여부"] = r["뉴딜해당_여부"].strip()

        area = to_num(r["사업시행면적"])

        # 원천 순번(seq)은 시군마다 1부터 다시 세서 겹친다. hash() 는 실행마다 바뀌므로 쓰지 않는다 — 중복은 unique_ids 가 접미어로 푼다.
        stable_id = seq or "x"

        out.append(
            {
                "id": f"gg-s{stable_id}",
                "kind": "소규모정비",
                "name": name,
                "gu": sigungu,
                "addr": addr,
                "lat": None,
                "lng": None,
                "type": type_label,
                "stage": r["추진단계"].strip(),
                "area": area,
                "households": households,
                "dates": dates,
                "extra": extra,
            }
        )
    return out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def unique_ids(projects: list[dict]) -> list[dict]:
    """같은 id 가 여러 번 나오면 두 번째부터 -2, -3 … 을 붙인다(입력 순서가 같으면 결과도 같다). 화면 목록 key 가 겹치면 엉뚱한 행이 보인다."""
    seen: dict[str, int] = {}
    out = []
    for p in projects:
        n = seen.get(p["id"], 0) + 1
        seen[p["id"]] = n
        out.append(p if n == 1 else {**p, "id": f"{p['id']}-{n}"})
    return out


def main() -> None:
    keys = load_keys()

    print("[1/4] 경기데이터드림 Sheet CSV 다운로드", file=sys.stderr)
    general_rows = fetch_sheet_csv(DATASETS["general"]["infId"], DATASETS["general"]["raw"])
    small_rows = fetch_sheet_csv(DATASETS["small"]["infId"], DATASETS["small"]["raw"])
    print(f"  일반 정비 사업: {len(general_rows)}행 / 소규모 주택정비: {len(small_rows)}행", file=sys.stderr)

    print("[2/4] 레코드 변환", file=sys.stderr)
    projects = build_general_projects(general_rows) + build_small_projects(small_rows)

    print("[3/4] VWorld 지오코딩", file=sys.stderr)
    addrs = [p["addr"] for p in projects]
    geocoded = geocode_all(addrs, keys["VWORLD"])

    ok = 0
    fail = 0
    fail_samples = []
    fail_by_kind = {"정비사업": [0, 0], "소규모정비": [0, 0]}
    for p in projects:
        pt = geocoded.get(p["addr"])
        counter = fail_by_kind[p["kind"]]
        if pt:
            p["lat"], p["lng"] = pt[0], pt[1]
            ok += 1
            counter[0] += 1
        else:
            fail += 1
            counter[1] += 1
            if len(fail_samples) < 10:
                fail_samples.append(f"[{p['kind']}] {p['gu']} / {p['name']} / {p['addr']}")

    projects = unique_ids(projects)
    print("[4/4] 저장", file=sys.stderr)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "gg-projects.json"
    out_path.write_text(
        json.dumps(projects, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    total = ok + fail
    print("\n=== 결과 ===", file=sys.stderr)
    print(f"총 {len(projects)}건 (일반정비 {len(general_rows)}, 소규모정비 {len(small_rows)})", file=sys.stderr)
    print(f"지오코딩 성공 {ok}/{total} ({ok/total*100:.1f}%)", file=sys.stderr)
    for kind, (k_ok, k_fail) in fail_by_kind.items():
        k_total = k_ok + k_fail
        if k_total:
            print(f"  - {kind}: {k_ok}/{k_total} ({k_ok/k_total*100:.1f}%)", file=sys.stderr)
    print("실패 샘플:", file=sys.stderr)
    for s in fail_samples:
        print(f"  {s}", file=sys.stderr)


if __name__ == "__main__":
    main()
