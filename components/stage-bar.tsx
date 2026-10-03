import { REDEV_STAGES, stageIndex } from '@/lib/categories';

/** 표준 8단계 진행 막대. 단계가 표준 목록에 없으면 그리지 않는다. */
export function StageBar({ stage }: { stage: string }) {
  const idx = stageIndex(stage);
  if (idx < 0) return null;
  return (
    <ol className="grid grid-cols-8 gap-1">
      {REDEV_STAGES.map((s, i) => (
        <li key={s} className="space-y-1">
          <div className={`h-1.5 rounded-full ${i <= idx ? 'bg-primary' : 'bg-[#E5E8EB]'}`} />
          <span className={`block text-[10px] leading-tight ${i === idx ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}
