// Nuxt UI base palettes (seed the shade scales). Each theme in app/assets/css/themes.css sets the real --ui-primary / --ui-secondary.
export default defineAppConfig({
  ui: {
    colors: { primary: 'indigo', secondary: 'amber', neutral: 'zinc' },
    card: {
      slots: {
        root: 'rounded-xl shadow-xs themed-surface',
        header: 'font-semibold text-highlighted',
      },
    },
    // Hooks for the per-event themes (app/assets/css/themes.css).
    button: {
      slots: { base: 'themed-btn' },
      variants: { variant: { solid: 'tb-solid', outline: 'tb-outline', soft: 'tb-soft', subtle: 'tb-subtle' } },
    },
    badge: { slots: { base: 'themed-badge' } },
    avatar: { slots: { root: 'rounded-lg' } },
    // Past days read as unavailable, and today has a ring, not just a color.
    calendar: {
      slots: {
        cellTrigger:
          'data-disabled:pointer-events-none data-disabled:opacity-30 data-today:not-data-selected:ring-1 data-today:not-data-selected:ring-inset data-today:not-data-selected:ring-primary',
      },
    },
    input: { slots: { base: 'themed-field' } },
    textarea: { slots: { base: 'themed-field' } },
    select: { slots: { base: 'themed-field' } },
    dashboardSidebar: { slots: { root: 'themed-side' } },
    dashboardNavbar: { slots: { root: 'themed-bar', title: 'themed-title' } },
    dashboardPanel: { slots: { body: 'themed-body' } },
    navigationMenu: { slots: { link: 'themed-nav' } },
  },
});
