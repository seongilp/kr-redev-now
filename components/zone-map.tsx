'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import { colorExpression } from '@/lib/categories';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * 서울 정비구역 지도. MapLibre **v5**(v6 는 Turbopack 에서 워커 로딩이 조용히 실패한다).
 * 구역 폴리곤 2천여 개를 GeoJSON 한 소스로 올리고, 보이기/숨기기는 setFilter 로만 한다(데이터 재업로드 없음).
 */

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const SOURCE = 'zones';
const DISTRICT_TYPE = '재정비촉진지구';
const SEOUL_BOUNDS: [[number, number], [number, number]] = [
  [126.76, 37.42],
  [127.19, 37.71],
];

export interface FlyTarget {
  lat: number;
  lng: number;
  key: number;
}

export function ZoneMap({
  data,
  visibleIds,
  selectedId,
  onSelect,
  flyTo,
}: {
  data: GeoJSON.FeatureCollection | null;
  /** 필터를 통과한 구역 id. null 이면 전부 보인다. */
  visibleIds: readonly string[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  flyTo: FlyTarget | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const dataRef = useRef(data);
  const flyKeyRef = useRef<number | null>(null);

  useEffect(() => void (onSelectRef.current = onSelect), [onSelect]);
  useEffect(() => void (dataRef.current = data), [data]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: SEOUL_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      minZoom: 9,
      maxZoom: 18,
      attributionControl: false,
      // CARTO 글리프엔 한글이 없어 브라우저 폰트로 그린다
      localIdeographFontFamily: "'Pretendard Variable', 'Noto Sans KR', sans-serif",
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: dataRef.current ?? { type: 'FeatureCollection', features: [] }, promoteId: 'id' });
      map.addLayer({
        id: 'zone-fill',
        type: 'fill',
        source: SOURCE,
        // 재정비촉진'지구'는 안에 구역들을 품은 큰 테두리라 면을 칠하지 않는다(구역이 가려진다)
        paint: {
          'fill-color': colorExpression() as never,
          'fill-opacity': ['case', ['==', ['get', 'type'], DISTRICT_TYPE], 0, 0.32],
        },
      });
      map.addLayer({
        id: 'zone-line',
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': colorExpression() as never, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 15, 1.6] },
        filter: ['!=', ['get', 'type'], DISTRICT_TYPE],
      });
      map.addLayer({
        id: 'zone-district-line',
        type: 'line',
        source: SOURCE,
        filter: ['==', ['get', 'type'], DISTRICT_TYPE],
        paint: { 'line-color': '#8B5CF6', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });
      map.addLayer({
        id: 'zone-selected',
        type: 'line',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#191F28', 'line-width': 3 },
      });
      map.addLayer({
        id: 'zone-label',
        type: 'symbol',
        source: SOURCE,
        minzoom: 14,
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-max-width': 8 },
        paint: { 'text-color': '#191F28', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      });
      loadedRef.current = true;
    });

    // 겹친 구역(지구 안의 구역, 재개발·재정비촉진 이중 지정)은 가장 작은 것을 고른다 — 사용자가 노린 건 대개 그쪽이다
    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['zone-fill'] });
      const smallest = [...hits].sort((a, b) => Number(a.properties?.area ?? 0) - Number(b.properties?.area ?? 0))[0];
      const id = smallest?.properties?.id as string | undefined;
      if (id) onSelectRef.current(id);
    });
    map.on('mouseenter', 'zone-fill', () => void (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'zone-fill', () => void (map.getCanvas().style.cursor = ''));

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  /* 데이터가 늦게 오면 로드 후 채운다 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const apply = () => map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(data);
    if (loadedRef.current) apply();
    else map.once('load', apply);
  }, [data]);

  /* 필터 — 통과한 id 만 보인다 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const filter = visibleIds ? (['in', ['get', 'id'], ['literal', visibleIds]] as never) : null;
      const isDistrict = ['==', ['get', 'type'], DISTRICT_TYPE];
      map.setFilter('zone-fill', filter);
      map.setFilter('zone-label', filter);
      map.setFilter('zone-line', (filter ? ['all', filter, ['!', isDistrict]] : ['!', isDistrict]) as never);
      map.setFilter('zone-district-line', (filter ? ['all', filter, isDistrict] : isDistrict) as never);
    };
    if (loadedRef.current) apply();
    else map.once('load', apply);
  }, [visibleIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter('zone-selected', ['==', ['get', 'id'], selectedId ?? '']);
  }, [selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo || flyKeyRef.current === flyTo.key) return;
    flyKeyRef.current = flyTo.key;
    map.easeTo({ center: [flyTo.lng, flyTo.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
  }, [flyTo]);

  return <div ref={containerRef} className="size-full" />;
}
