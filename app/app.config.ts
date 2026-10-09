// Colors from the app icon: indigo calendar, amber "celebrate" accent, on neutral zinc.
export default defineAppConfig({
  ui: {
    colors: { primary: 'indigo', secondary: 'amber', neutral: 'zinc' },
    card: {
      slots: {
        root: 'rounded-xl shadow-xs',
        header: 'font-semibold text-highlighted',
      },
    },
  },
});
