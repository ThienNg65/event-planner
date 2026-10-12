// Colors from the app icon: indigo calendar, amber "celebrate" accent, on neutral zinc.
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
    input: { slots: { base: 'themed-field' } },
    textarea: { slots: { base: 'themed-field' } },
    select: { slots: { base: 'themed-field' } },
    dashboardSidebar: { slots: { root: 'themed-side' } },
    dashboardNavbar: { slots: { root: 'themed-bar', title: 'themed-title' } },
    dashboardPanel: { slots: { body: 'themed-body' } },
    navigationMenu: { slots: { link: 'themed-nav' } },
  },
});
