/**
 * PrimeNG Pass-Through (PT) configuration mapping Snow UI design tokens
 * to Tailwind CSS classes for consistent theming across both apps.
 *
 * Uses CSS custom properties defined in styles.css so dark mode works automatically.
 */
export const snowPassThrough = {
  datatable: {
    root: { class: 'rounded-xl border border-border bg-card shadow-sm overflow-hidden' },
    tableContainer: { class: 'overflow-x-auto' },
    table: { class: 'w-full text-sm' },
    thead: { class: 'bg-muted/30' },
    headerRow: { class: 'border-b border-border' },
    headerCell: { class: 'px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider' },
    tbody: { class: 'divide-y divide-border' },
    bodyRow: { class: 'hover:bg-muted/20 transition-colors' },
    bodyCell: { class: 'px-4 py-3 text-sm text-foreground' },
    emptyMessage: { class: 'text-center py-12 text-muted-foreground' },
    sortIcon: { class: 'ml-1 text-muted-foreground' },
    paginator: {
      root: { class: 'flex items-center justify-between px-4 py-3 border-t border-border bg-card' },
    },
  },
  dialog: {
    root: { class: 'rounded-xl bg-card text-card-foreground border border-border shadow-xl max-h-[90vh]' },
    header: { class: 'flex items-center justify-between px-6 py-4 border-b border-border' },
    title: { class: 'text-lg font-semibold text-foreground' },
    content: { class: 'px-6 py-4 overflow-y-auto' },
    footer: { class: 'flex items-center justify-end gap-3 px-6 py-4 border-t border-border' },
    closeButton: { class: 'rounded-lg p-1 text-muted-foreground hover:bg-muted/50 transition-colors' },
    mask: { class: 'bg-black/50 backdrop-blur-sm' },
  },
  confirmdialog: {
    root: { class: 'rounded-xl bg-card text-card-foreground border border-border shadow-xl' },
    header: { class: 'flex items-center gap-3 px-6 py-4 border-b border-border' },
    title: { class: 'text-lg font-semibold text-foreground' },
    content: { class: 'px-6 py-4' },
    footer: { class: 'flex items-center justify-end gap-3 px-6 py-4 border-t border-border' },
    message: { class: 'text-sm text-foreground' },
    icon: { class: 'text-warning text-2xl' },
    acceptButton: {
      root: { class: 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors' },
    },
    rejectButton: {
      root: { class: 'inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors' },
    },
  },
  toast: {
    root: { class: 'w-96' },
    message: { class: 'rounded-lg border border-border bg-card shadow-lg mb-3 overflow-hidden' },
    messageContent: { class: 'flex items-start gap-3 p-4' },
    messageIcon: { class: 'text-lg shrink-0 mt-0.5' },
    messageText: { class: 'flex-1' },
    summary: { class: 'text-sm font-semibold text-foreground' },
    detail: { class: 'text-sm text-muted-foreground mt-1' },
    closeButton: { class: 'rounded p-1 text-muted-foreground hover:bg-muted/50 shrink-0' },
  },
  tag: {
    root: { class: 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium' },
  },
  card: {
    root: { class: 'rounded-xl border border-border bg-card shadow-sm' },
    header: { class: 'px-6 pt-6' },
    title: { class: 'text-base font-semibold text-foreground' },
    subtitle: { class: 'text-sm text-muted-foreground mt-1' },
    body: { class: 'p-6' },
    content: { class: '' },
    footer: { class: 'px-6 pb-6 pt-0' },
  },
  select: {
    root: { class: 'w-full' },
    trigger: { class: 'flex items-center justify-between rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground hover:border-ring transition-colors' },
    panel: { class: 'rounded-lg border border-border bg-popover shadow-lg mt-1 overflow-hidden' },
    list: { class: 'py-1' },
    option: { class: 'px-3 py-2 text-sm text-popover-foreground hover:bg-muted/50 cursor-pointer transition-colors' },
    optionLabel: { class: '' },
  },
  multiselect: {
    root: { class: 'w-full' },
    trigger: { class: 'flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground hover:border-ring transition-colors min-h-[38px] flex-wrap' },
    panel: { class: 'rounded-lg border border-border bg-popover shadow-lg mt-1 overflow-hidden' },
    header: { class: 'px-3 py-2 border-b border-border' },
    list: { class: 'py-1 max-h-60 overflow-y-auto' },
    option: { class: 'flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-muted/50 cursor-pointer transition-colors' },
    chip: { class: 'inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-foreground' },
  },
  inputnumber: {
    root: { class: 'w-full' },
    pcInput: {
      root: { class: 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors' },
    },
  },
  inputtext: {
    root: { class: 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors' },
  },
  textarea: {
    root: { class: 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors resize-none' },
  },
  toggleswitch: {
    root: { class: 'inline-flex items-center cursor-pointer' },
    slider: { class: 'relative w-10 h-5 rounded-full bg-muted transition-colors peer-checked:bg-primary' },
  },
  datepicker: {
    root: { class: 'w-full' },
    pcInput: {
      root: { class: 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors' },
    },
    panel: { class: 'rounded-lg border border-border bg-popover shadow-lg p-3' },
    header: { class: 'flex items-center justify-between mb-2' },
    title: { class: 'text-sm font-medium text-foreground' },
    dayLabel: { class: 'text-xs text-muted-foreground font-medium' },
    day: { class: 'w-8 h-8 rounded-lg text-sm text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center' },
    selectedDay: { class: 'bg-primary text-primary-foreground' },
  },
  inputchips: {
    root: { class: 'w-full rounded-lg border border-border bg-input px-2 py-1.5 flex flex-wrap gap-1.5 focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-ring transition-colors' },
    chip: { class: 'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground' },
    chipRemoveIcon: { class: 'text-muted-foreground hover:text-foreground cursor-pointer' },
    input: { class: 'border-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none flex-1 min-w-[120px]' },
  },
  tabs: {
    root: { class: '' },
    tabList: { class: 'flex border-b border-border' },
    tab: { class: 'px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent transition-colors cursor-pointer' },
    activeTab: { class: 'text-primary border-primary' },
    tabpanels: { class: 'pt-4' },
  },
  paginator: {
    root: { class: 'flex items-center justify-between px-4 py-3 border-t border-border' },
    first: { class: 'rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-40' },
    prev: { class: 'rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-40' },
    next: { class: 'rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-40' },
    last: { class: 'rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-40' },
    pages: { class: 'flex items-center gap-1' },
    page: { class: 'w-8 h-8 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors flex items-center justify-center' },
    current: { class: 'bg-primary text-primary-foreground' },
  },
  chart: {
    root: { class: 'rounded-xl border border-border bg-card p-6' },
  },
  skeleton: {
    root: { class: 'bg-muted/50 rounded-lg animate-pulse' },
  },
  popover: {
    root: { class: 'rounded-lg border border-border bg-popover shadow-lg' },
    content: { class: 'p-4' },
  },
  menu: {
    root: { class: 'rounded-lg border border-border bg-popover shadow-lg py-1 min-w-[160px]' },
    item: { class: 'px-3 py-2 text-sm text-popover-foreground hover:bg-muted/50 cursor-pointer transition-colors' },
    label: { class: '' },
    separator: { class: 'my-1 border-t border-border' },
  },
};
