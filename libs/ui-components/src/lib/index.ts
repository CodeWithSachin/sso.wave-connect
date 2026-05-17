// Button
export { ButtonComponent, type ButtonVariant, type ButtonSize } from './button/button.component';

// Input
export { InputComponent } from './input/input.component';

// Badge
export { BadgeComponent, type BadgeVariant } from './badge/badge.component';

// Avatar
export { AvatarComponent, type AvatarSize } from './avatar/avatar.component';

// Card
export { CardComponent } from './card/card.component';

// Loading
export { SpinnerComponent, type SpinnerSize } from './loading/spinner.component';

// Toast
export { ToastService, ToastContainerComponent, type Toast, type ToastType } from './toast/toast.component';

// Pagination
export { PaginationComponent } from './pagination/pagination.component';

// Data Table
export {
  DataTableComponent,
  type TableColumn,
  type SortDirection,
  type SortEvent,
} from './table/data-table.component';

// Dialog
export { DialogComponent } from './dialog/dialog.component';

// Tenant switcher (shared by admin-console + developer-portal)
export {
  TenantSwitcherComponent,
  type MembershipSummary,
} from './tenant-switcher/tenant-switcher.component';

// PrimeNG Pass-Through Configuration
export { snowPassThrough } from './primeng-passthrough';
