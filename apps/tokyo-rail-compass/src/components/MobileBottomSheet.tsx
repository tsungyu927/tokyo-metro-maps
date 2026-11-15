import React, { useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { locale } from '../locales/i18n';

export type SheetSnap = 'peek' | 'half' | 'full';

interface MobileBottomSheetProps {
  snap: SheetSnap;
  onChangeSnap: (snap: SheetSnap) => void;
  summaryTitle: string;
  children: React.ReactNode;
}

const SNAP_HEIGHT_CLASSES: Record<SheetSnap, string> = {
  peek: 'h-[76px]',
  half: 'h-[48dvh]',
  full: 'h-[78dvh]',
};

/**
 * Responsive 3-snap draggable/tappable bottom sheet for mobile exploration above the tab bar.
 */
export function MobileBottomSheet({
  snap,
  onChangeSnap,
  summaryTitle,
  children,
}: MobileBottomSheetProps) {
  const touchStartY = useRef<number | null>(null);

  const cycleUp = () => {
    if (snap === 'peek') onChangeSnap('half');
    else if (snap === 'half') onChangeSnap('full');
  };

  const cycleDown = () => {
    if (snap === 'full') onChangeSnap('half');
    else if (snap === 'half') onChangeSnap('peek');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;
    const delta = endY - touchStartY.current;
    touchStartY.current = null;

    if (delta < -36) {
      cycleUp();
    } else if (delta > 36) {
      cycleDown();
    }
  };

  const toggleSnapOnHeaderTap = () => {
    if (snap === 'peek') onChangeSnap('half');
    else if (snap === 'half') onChangeSnap('full');
    else onChangeSnap('half');
  };

  return (
    <div
      className={`md:hidden fixed left-2 right-2 bottom-[68px] z-30 rounded-t-2xl rounded-b-xl bg-white/95 backdrop-blur-lg border border-slate-200/90 shadow-glass flex flex-col transition-all duration-300 ease-out overflow-hidden ${SNAP_HEIGHT_CLASSES[snap]}`}
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={toggleSnapOnHeaderTap}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSnapOnHeaderTap();
          }
        }}
        className="px-4 pt-2 pb-2.5 border-b border-slate-100 shrink-0 cursor-pointer select-none"
      >
        <div className="w-10 h-1.5 rounded-full bg-slate-300 mx-auto mb-2" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-slate-900 truncate">{summaryTitle}</span>
          <div className="flex items-center gap-1 shrink-0">
            {snap !== 'full' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cycleUp();
                }}
                aria-label={locale.controls.sheetFull}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            )}
            {snap !== 'peek' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cycleDown();
                }}
                aria-label={locale.controls.sheetPeek}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3">{children}</div>
    </div>
  );
}

