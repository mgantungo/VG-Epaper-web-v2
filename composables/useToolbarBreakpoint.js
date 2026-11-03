import { useBreakpoints } from '@vueuse/core';

/**
 * Drives the toolbar's three-tier layout: mobile / tablet / desktop.
 *
 * This replaces a single Tailwind `sm:` (640px) on/off toggle that turned
 * out not to be enough — real testing (see the iPhone-width and 956px
 * screenshots that prompted this) showed the FULL toolbar (nav + info +
 * search + contents + archive + sign-in) still overflows the viewport at
 * 956px, nowhere near "mobile" by any reasonable definition, but still too
 * narrow for everything to sit inline without cutting off. Rather than
 * guess at one wider breakpoint, the toolbar now has three explicit tiers
 * to render against, each showing a deliberately chosen amount inline
 * before folding the rest into the retractable menu — see EpaperToolbar.vue
 * for exactly what's assigned to each tier.
 */
export function useToolbarBreakpoint() {
  // Explicit breakpoint for every tier this composable reports — including
  // "mobile" itself. An earlier version defined isMobile as
  // `breakpoints.smaller('tablet')`, which computes the right number but
  // reads like a bug: "isMobile" was entirely defined in terms of a
  // breakpoint literally called 'tablet', with nothing actually named
  // 'mobile' anywhere. Giving mobile its own explicit entry and using the
  // same `between()` shape for all three tiers makes each one equally
  // explicit, not just numerically correct.
  const breakpoints = useBreakpoints({
    mobile: 0,
    tablet: 640,   // Tailwind's `sm`
    tabletWide: 768, // Search + Contents inline from here; below it they
                     // live in the ≡ menu (640–767px overflowed with them)
    laptop: 1024,  // not a tier of its own — just where Archive fits inline
                    // inside the tablet tier, now that the toolbar no longer
                    // carries the edition name/date/volume block (measured:
                    // tablet-tier content plus Archive is ~965px wide)
    desktop: 1280  // Tailwind's `xl` — chosen because 1024px-class widths
                    // (956px tested directly) still overflowed with
                    // everything inline; 1280px is where it's confirmed to
                    // actually fit.
  });

  const isMobile = breakpoints.between('mobile', 'tablet');
  const isTablet = breakpoints.between('tablet', 'desktop');
  const isDesktop = breakpoints.greaterOrEqual('desktop');
  const isLaptopUp = breakpoints.greaterOrEqual('laptop');
  const isTabletWideUp = breakpoints.greaterOrEqual('tabletWide');

  return { isMobile, isTablet, isDesktop, isLaptopUp, isTabletWideUp };
}