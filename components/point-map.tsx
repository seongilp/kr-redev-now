'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

/** WGS84 좌표 */
export interface LatLon {
  lat: number;
  lon: number;
}

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * 경기 정비사업 점 지도(경계 데이터가 없어 주소를 좌표로 바꿔 점으로 찍는다). 육아나우 지도에서 가져왔다.
 * 원래 설명: MapLibre **v5** — v6 는 Turbopack 에서 워커 로딩이 실패해 지도가 조용히 안 뜬다(메모리 기록).
 * 베이스맵은 CARTO positron(밝은 톤). 밝은 지도에서는 핀에 흰 테두리를 둘러 도로와 분리한다.
 *
 * 마커는 DOM 이 아니라 GeoJSON 원 레이어다. 켜진 레이어 전부(수만 개까지)를 한 소스에 올리고
 * 색은 호출부가 계산해 넣는다 — 병·의원은 진료상태 색, 나머지는 레이어 색.
 * 지도는 point.color 를 칠하기만 한다(판정 로직이 두 군데로 갈라지지 않게).
 */

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  title: string;
  /** #hex. 레이어 색 또는 진료상태 색. */
  color: string;
  /** 강조 핀(지금 진료 중). 반지름을 키우고 잉크색 테두리를 준다. */
  accent?: boolean;
}

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const SOURCE = 'places';
/** 동네 단위가 보이는 줌. */
const INITIAL_ZOOM = 9;
/** 경기도 전역 */
const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [126.3, 36.9],
  [127.9, 38.3],
];

function toGeoJson(points: readonly MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, title: p.title, color: p.color, accent: p.accent ? 1 : 0 },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** 지도 이동 목적지(프로그램 이동). key 가 바뀔 때만 실제로 이동한다(사용자 조작과 안 싸우게). */
export interface FlyTarget {
  lat: number;
  lon: number;
  zoom: number;
  key: number;
}

export function PointMap({
  points,
  center,
  isUserLocation,
  selectedId,
  onSelect,
  flyTo,
  onMoveEnd,
}: {
  points: readonly MapPoint[];
  /** 초기 중심. 실제 위치면 그 좌표, 아니면 서울시청. */
  center: LatLon;
  /** center 가 사용자의 실제 위치인가. true 일 때만 파란 '내 위치' 점을 찍는다. */
  isUserLocation: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  flyTo?: FlyTarget | null;
  /** 사용자가 지도를 옮겼을 때 새 중심. 목록을 '지도 중심에서 가까운 순'으로 다시 정렬하는 데 쓴다. */
  onMoveEnd?: (center: LatLon) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onMoveEndRef = useRef(onMoveEnd);
  const pointsRef = useRef(points);
  const centerRef = useRef(center);
  const flyKeyRef = useRef<number | null>(null);

  useEffect(() => void (onSelectRef.current = onSelect), [onSelect]);
  useEffect(() => void (onMoveEndRef.current = onMoveEnd), [onMoveEnd]);
  useEffect(() => void (pointsRef.current = points), [points]);
  useEffect(() => void (centerRef.current = center), [center]);

  /* 지도 생성 — 한 번만. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: KOREA_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      minZoom: 6,
      maxZoom: 18,
      attributionControl: false,
      // CARTO 글리프에 한글이 없어 라벨이 안 보인다. 브라우저 폰트로 그린다.
      localIdeographFontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif",
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: toGeoJson(pointsRef.current) });

      map.addLayer({
        id: 'place-selected',
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 14,
          'circle-color': 'transparent',
          // 밝은 배경에서는 흰 링이 보이지 않는다. 잉크색으로 두른다.
          'circle-stroke-color': '#191F28',
          'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'place-point',
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            7,
            ['case', ['==', ['get', 'accent'], 1], 2.5, 1.2],
            10,
            ['case', ['==', ['get', 'accent'], 1], 4, 2.5],
            13,
            ['case', ['==', ['get', 'accent'], 1], 9, 6],
            16,
            ['case', ['==', ['get', 'accent'], 1], 13, 9],
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.92,
          // 어두운 베이스맵에서 서로·배경과 분리되도록 진한 테두리. 강조 핀만 밝은 테두리.
          // 강조 핀은 잉크색 테두리로 한 번 더 분리한다. 나머지는 흰 테두리.
          'circle-stroke-color': ['case', ['==', ['get', 'accent'], 1], '#191F28', '#ffffff'],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0, 10, 0.8, 13, 2],
        },
      });
      map.addLayer({
        id: 'place-label',
        type: 'symbol',
        source: SOURCE,
        minzoom: 15,
        layout: {
          'text-field': ['get', 'title'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#191F28', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      });

      loadedRef.current = true;
      map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(toGeoJson(pointsRef.current));
    });

    map.on('click', (e) => {
      if (!loadedRef.current) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ['place-point', 'place-label'] });
      const id = hit[0]?.properties?.id as string | undefined;
      if (id) onSelectRef.current(id);
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      onMoveEndRef.current?.({ lat: c.lat, lon: c.lng });
    });

    for (const layer of ['place-point', 'place-label']) {
      map.on('mouseenter', layer, () => void (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => void (map.getCanvas().style.cursor = ''));
    }

    // 0x0 으로 생성되면 줌이 굳는다. 실제 크기를 얻은 뒤 한 번 더 맞춘다.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      map.resize();
      if (fittedRef.current) return;
      fittedRef.current = true;
      const c = centerRef.current;
      map.easeTo({ center: [c.lon, c.lat], zoom: INITIAL_ZOOM, duration: 0 });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      fittedRef.current = false;
    };
  }, []);

  /* 프로그램 이동: flyTo.key 가 바뀔 때만 easeTo. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo || flyKeyRef.current === flyTo.key) return;
    flyKeyRef.current = flyTo.key;
    fittedRef.current = true; // 초기 fit 로직과 안 겹치게
    map.easeTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom, duration: 600 });
  }, [flyTo]);

  /* 포인트 갱신(레이어 토글·진료상태 변화). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(points.length ? toGeoJson(points) : EMPTY);
  }, [points]);

  /* 실제 위치일 때만 파란 '내 위치' 점. 폴백(서울시청)은 찍지 않는다. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isUserLocation) return;
    const el = document.createElement('div');
    el.className = 'kr-user-dot';
    const marker = new maplibregl.Marker({ element: el }).setLngLat([center.lon, center.lat]).addTo(map);
    return () => void marker.remove();
  }, [center, isUserLocation]);

  /* 선택 강조 + 화면으로 끌어오기. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter('place-selected', ['==', ['get', 'id'], selectedId ?? '']);
    if (!selectedId) return;
    const hit = pointsRef.current.find((p) => p.id === selectedId);
    if (hit) map.easeTo({ center: [hit.lon, hit.lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
  }, [selectedId]);

  return <div ref={containerRef} className="size-full" />;
}
