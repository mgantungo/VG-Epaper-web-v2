// File: /var/www/VGEpaper/web/composables/useBreakpoint.js
import { useMediaQuery } from '@vueuse/core';
import { onMounted, watch } from 'vue';
import { useReaderStore } from '~/stores/reader';

/**
 * Reader layout and default view mode, decided by measured viewport size
 * (never user-agent sniffing). The reader can still switch single/double
 * from the toolbar on wide screens; that choice is saved (stores/reader.js).
 */
/**
 * SCROLLING READER (Nov 2026): also decides the reader's LAYOUT.
 *  - compact: phones, and tablets held upright (portrait, up to 1100 px wide).
 *    One page at a time at full width, section chips on top, page strip at
 *    the bottom.
 *  - wide: desktops, and tablets on their side. Page sidebar, single pages
 *    or two-page spreads (the reader's saved choice; spreads by default).
 */
export const COMPACT_QUERY = '(max-width: 767px), (orientation: portrait) and (max-width: 1100px)';

export function useResponsiveReaderMode() {
  const compact = useMediaQuery(COMPACT_QUERY);
  const readerStore = useReaderStore();

  onMounted(() => {
    readerStore.restoreReaderPrefs();
    const saved = readerStore.savedViewMode();
    readerStore.setViewMode(saved || 'double', Boolean(saved));
    readerStore.setLayoutCompact(compact.value);
  });

  // Turning a tablet, or resizing a window across the line, switches layout
  // and keeps the reader on the same page (setLayoutCompact).
  watch(compact, (now) => readerStore.setLayoutCompact(now));

  return { compact };
}