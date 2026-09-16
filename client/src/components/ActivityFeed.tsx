import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScrollText, Layers, Undo2, Plug, PlugZap, Swords, Flag, Clock, Sparkles } from 'lucide-react';
import { ActivityEvent } from '@shared/types';

interface ActivityFeedProps {
  events: ActivityEvent[];
  compact?: boolean;
}

const getEventIcon = (type: ActivityEvent['type']) => {
  switch (type) {
    case 'chip_placed': return <Layers size={11} className="text-indigo-400" />;
    case 'chip_removed': return <Layers size={11} className="text-rose-400" />;
    case 'sequence_completed': return <Sparkles size={11} className="text-amber-400" />;
    case 'player_disconnected': return <PlugZap size={11} className="text-rose-400" />;
    case 'player_reconnected': return <Plug size={11} className="text-emerald-400" />;
    case 'undo_used': return <Undo2 size={11} className="text-purple-400" />;
    case 'turn_skipped': return <Clock size={11} className="text-amber-400" />;
    case 'surrender': return <Flag size={11} className="text-rose-400" />;
    case 'game_start': return <Swords size={11} className="text-indigo-400" />;
    case 'game_end': return <Flag size={11} className="text-emerald-400" />;
    default: return <ScrollText size={11} className="text-slate-400" />;
  }
};

const getTeamColor = (team?: string) => {
  if (!team) return '';
  const t = team.toLowerCase();
  if (t === 'blue' || t === '#2563eb') return 'bg-blue-500';
  if (t === 'red' || t === '#dc2626') return 'bg-rose-500';
  if (t === 'green' || t === '#16a34a') return 'bg-emerald-500';
  if (t === 'gold' || t === 'yellow' || t === '#ca8a04') return 'bg-amber-500';
  return 'bg-slate-500';
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ events, compact = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (containerRef.current && events.length > lastCountRef.current) {
      containerRef.current.scrollTop = 0;
    }
    lastCountRef.current = events.length;
  }, [events.length]);

  const displayEvents = events.slice(0, 20);

  if (compact && displayEvents.length === 0) return null;

  return (
    <div className={`bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col ${compact ? '' : 'shadow-md'}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-850/80 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <ScrollText size={12} className="text-amber-400" />
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-300">Game Log</h4>
        </div>
        <span className="text-[9px] font-bold text-slate-500 font-mono">{displayEvents.length} event{displayEvents.length !== 1 ? 's' : ''}</span>
      </div>

      <div
        ref={containerRef}
        className={`overflow-y-auto flex-col-reverse ${compact ? 'max-h-36' : 'max-h-64'} space-y-0.5 p-2`}
        style={{ display: displayEvents.length > 0 ? 'flex' : 'block' }}
      >
        <AnimatePresence initial={false}>
          {displayEvents.map((event) => (
            <motion.div
              key={event.id}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-850/60 transition-all"
            >
              <div className="shrink-0 w-5 h-5 rounded-md bg-slate-800/80 flex items-center justify-center border border-slate-700/60 mt-0.5">
                {getEventIcon(event.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {event.team && (
                    <span className={`w-2 h-2 rounded-full ${getTeamColor(event.team)} shrink-0`} />
                  )}
                  {event.playerName && (
                    <span className="text-[10px] font-black text-slate-200 truncate">{event.playerName}</span>
                  )}
                  <span className="text-[10.5px] text-slate-300 leading-snug font-medium">{event.message}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {displayEvents.length === 0 && (
          <div className="text-center py-6 text-slate-500 text-[10px]">
            <ScrollText size={18} className="mx-auto mb-1.5 opacity-40" />
            Awaiting game events...
          </div>
        )}
      </div>
    </div>
  );
};
