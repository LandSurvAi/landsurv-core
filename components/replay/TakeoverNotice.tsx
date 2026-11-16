import { useReplaySession } from '../../contexts/ReplaySessionContext.tsx';

export const TakeoverNotice: React.FC = () => {
  const { mode, ready, takeoverTitle } = useReplaySession();
  if (mode !== 'takeover' || !ready) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[99] max-w-lg -translate-x-1/2 rounded-md border border-cyan-500/40 bg-slate-950/95 px-3 py-2 text-center text-[11px] text-cyan-100 shadow-xl">
      Editable copy{takeoverTitle ? ` from “${takeoverTitle}”` : ''}. Save the project to keep your changes.
    </div>
  );
};
