---
name: ngrx
description: "NgRx state management toolkit for Angular. Generates code, provides best practices, and architectural guidance for all NgRx packages: Store, Effects, Entity, SignalStore, ComponentStore, Router Store, Operators, Schematics, and ESLint Plugin. Trigger on ngrx, state management, store, actions, reducers, selectors, effects, signalstore, component-store, entity adapter, router-store, createAction, createReducer, createSelector, createEffect, createFeature, createActionGroup, signalStore, withState, withComputed, withMethods, patchState, rxMethod."
---

# NgRx Developer Guidelines

NgRx is a reactive state management library for Angular, inspired by Redux. It provides a predictable, RxJS-powered state container with tooling for Angular applications.

**Official site:** https://ngrx.io | **License:** MIT | **Current version:** v21

## General Rules

1. Always check the project's NgRx version before providing guidance. APIs differ significantly between versions (especially pre-v8 class-based vs v8+ creator functions vs v15+ functional effects vs v17+ SignalStore).
2. Prefer the modern creator function APIs (`createAction`, `createReducer`, `createSelector`, `createEffect`, `createFeature`, `createActionGroup`) over older class-based or switch-case patterns.
3. For new projects on Angular 17+, recommend **NgRx SignalStore** (`@ngrx/signals`) as the primary state management approach unless global Redux-style state is explicitly needed.
4. After generating NgRx code, always run `ng build` to verify there are no compilation errors.
5. Use NgRx Schematics (`@ngrx/schematics`) for scaffolding when available.

## Package Overview

NgRx consists of these packages:

- `@ngrx/store` - Global state management (Redux pattern)
- `@ngrx/effects` - Side effect management for async operations
- `@ngrx/entity` - Entity collection management with CRUD adapters
- `@ngrx/router-store` - Angular Router state bindings
- `@ngrx/component-store` - Component-level state management
- `@ngrx/signals` - Signal-based state management (SignalStore, signalState)
- `@ngrx/operators` - Utility RxJS operators
- `@ngrx/schematics` - Code generation schematics
- `@ngrx/eslint-plugin` - Linting rules for NgRx best practices
- `@ngrx/store-devtools` - Redux DevTools integration

## Installation

```bash
# Install all core packages
npm install @ngrx/store @ngrx/effects @ngrx/entity @ngrx/router-store @ngrx/component-store @ngrx/signals @ngrx/operators

# DevTools (dev only)
npm install @ngrx/store-devtools --save-dev

# Schematics
npm install @ngrx/schematics --save-dev

# ESLint Plugin
npm install @ngrx/eslint-plugin --save-dev

# Configure schematics as default collection
ng config cli.schematicCollections "[@ngrx/schematics]"
```

---

# @ngrx/store — Global State Management

## Architecture

The Store follows a unidirectional data flow:

1. **Actions** describe unique events (user interactions, API responses, device events)
2. **Reducers** are pure functions that compute new state from current state + action
3. **Selectors** are pure functions that extract and compose state slices
4. **Store** is both an Observable of state and an Observer of actions

**Critical rule:** All dispatched actions are ALWAYS processed by Reducers FIRST, then by Effects.

## When to Use @ngrx/store vs Alternatives

- Use `@ngrx/store` for **global, shared application state** (auth, app config, cross-feature data)
- Use `@ngrx/component-store` for **local component state** that doesn't need global access
- Use `@ngrx/signals` (SignalStore) for **modern Angular 17+ projects** wanting signal-based reactivity
- For simple state, consider plain Angular services with signals before reaching for NgRx

## Actions

Actions are plain objects with a `type` string property following the `[Source] Event` naming pattern.

### Five Rules for Writing Good Actions

1. **Upfront** — Plan actions before feature development
2. **Divide** — Organize actions by event source
3. **Many** — Create many specific actions (they're cheap)
4. **Event-Driven** — Capture events, not commands
5. **Descriptive** — Include detailed context for debugging

### createAction (Single Actions)

```typescript
import { createAction, props } from "@ngrx/store";

// Action without payload
export const opened = createAction("[Products Page] Opened");

// Action with typed payload
export const loginSuccess = createAction(
	"[Auth API] Login Success",
	props<{ user: User; token: string }>(),
);

// Dispatching
this.store.dispatch(loginSuccess({ user, token }));
```

### createActionGroup (Recommended for v14+)

Groups related actions by source, auto-generates camelCase creator names, and prevents duplicate types at compile time.

```typescript
import { createActionGroup, emptyProps, props } from "@ngrx/store";

export const ProductsPageActions = createActionGroup({
	source: "Products Page",
	events: {
		Opened: emptyProps(),
		"Pagination Changed": props<{ page: number; offset: number }>(),
		"Query Changed": (query: string) => ({ query }),
	},
});

export const ProductsApiActions = createActionGroup({
	source: "Products API",
	events: {
		productsLoadedSuccess: props<{ products: Product[] }>(),
		productsLoadedFailure: props<{ errorMsg: string }>(),
	},
});

// Usage — auto-generated names:
this.store.dispatch(ProductsPageActions.opened());
this.store.dispatch(
	ProductsPageActions.paginationChanged({ page: 1, offset: 10 }),
);
this.store.dispatch(ProductsApiActions.productsLoadedSuccess({ products }));
```

**Limitation:** Action creator names are always camelCased versions of event names — you cannot customize them.

## Reducers

Reducers are pure, synchronous functions that produce new state. They MUST be immutable.

### createReducer

```typescript
import { createReducer, on } from "@ngrx/store";

export interface BooksState {
	books: Book[];
	loading: boolean;
	error: string | null;
}

export const initialState: BooksState = {
	books: [],
	loading: false,
	error: null,
};

export const booksReducer = createReducer(
	initialState,
	on(BooksPageActions.opened, (state) => ({
		...state,
		loading: true,
		error: null,
	})),
	on(BooksApiActions.booksLoadedSuccess, (state, { books }) => ({
		...state,
		books,
		loading: false,
	})),
	on(BooksApiActions.booksLoadedFailure, (state, { errorMsg }) => ({
		...state,
		loading: false,
		error: errorMsg,
	})),
);
```

### Immutability Rules

- The spread operator (`...`) only does **shallow copying**
- For deeply nested objects, manually copy each level or use a library like **Immer**
- Never mutate arrays — use `[...array, newItem]`, `array.filter()`, `array.map()`

### Registration

**Standalone (recommended for modern Angular):**

```typescript
// app.config.ts
import { provideStore } from "@ngrx/store";
import { provideState } from "@ngrx/store";

export const appConfig: ApplicationConfig = {
	providers: [
		provideStore(), // Root store
		provideState({ name: "books", reducer: booksReducer }), // Feature state
	],
};

// Or in lazy-loaded route:
export const routes: Routes = [
	{
		path: "books",
		providers: [provideState({ name: "books", reducer: booksReducer })],
		component: BooksComponent,
	},
];
```

**Module-based (legacy):**

```typescript
@NgModule({
  imports: [
    StoreModule.forRoot({}),                              // Root
    StoreModule.forFeature('books', booksReducer),        // Feature
  ],
})
```

## createFeature (Recommended for v14+)

Automatically generates selectors from reducer state properties.

```typescript
import { createFeature, createReducer, on } from "@ngrx/store";

export const booksFeature = createFeature({
	name: "books",
	reducer: createReducer(
		initialState,
		on(BooksApiActions.booksLoadedSuccess, (state, { books }) => ({
			...state,
			books,
			loading: false,
		})),
	),
	extraSelectors: ({ selectBooks, selectLoading }) => ({
		selectActiveBooks: createSelector(selectBooks, (books) =>
			books.filter((b) => b.active),
		),
	}),
});

// Auto-generated exports:
export const {
	name, // 'books'
	reducer, // the reducer function
	selectBooksState, // feature selector
	selectBooks, // state.books.books
	selectLoading, // state.books.loading
	selectError, // state.books.error
	selectActiveBooks, // extra selector
} = booksFeature;

// Registration with standalone API:
provideState(booksFeature);
```

**Important:** State interfaces cannot use optional properties (`?`). Use `string | null` or `string | undefined` instead.

## Selectors

Pure functions for extracting and composing state slices with automatic memoization.

### createSelector & createFeatureSelector

```typescript
import { createSelector, createFeatureSelector } from '@ngrx/store';

// Feature selector
export const selectBooksState = createFeatureSelector<BooksState>('books');

// Child selectors
export const selectAllBooks = createSelector(
  selectBooksState,
  (state) => state.books
);

export const selectLoading = createSelector(
  selectBooksState,
  (state) => state.loading
);

// Composed selectors (combining multiple slices)
export const selectBookCount = createSelector(
  selectAllBooks,
  (books) => books.length
);

// Dictionary of selectors (auto projection)
export const selectBooksSummary = createSelector({
  books: selectAllBooks,
  loading: selectLoading,
  count: selectBookCount,
});

// Component usage
@Component({ ... })
export class BooksComponent {
  books = this.store.selectSignal(selectAllBooks);     // Signal-based (Angular 16+)
  // OR
  books$ = this.store.select(selectAllBooks);           // Observable-based

  constructor(private store: Store) {}
}
```

### Selector Factories (for parameterized selectors)

```typescript
export const selectBookById = (id: string) =>
	createSelector(selectAllBooks, (books) => books.find((b) => b.id === id));

// Usage
this.store.select(selectBookById("123"));
```

### Memory Management

Selectors keep memoized values indefinitely. Use `release()` to free memory:

```typescript
selectAllBooks.release();
```

## Meta-Reducers

Higher-order reducers that wrap other reducers for cross-cutting concerns (logging, undo, hydration).

```typescript
export function logger(reducer: ActionReducer<any>): ActionReducer<any> {
	return (state, action) => {
		console.log("state before:", state);
		console.log("action:", action);
		const nextState = reducer(state, action);
		console.log("state after:", nextState);
		return nextState;
	};
}

// Registration
provideStore({}, { metaReducers: [logger] });
```

## Runtime Checks

Catch common mistakes in development (automatically disabled in production):

```typescript
provideStore(
	{},
	{
		runtimeChecks: {
			strictStateImmutability: true, // default: true
			strictActionImmutability: true, // default: true
			strictStateSerializability: false, // default: false
			strictActionSerializability: false, // default: false
			strictActionWithinNgZone: false, // default: false
			strictActionTypeUniqueness: false, // default: false
		},
	},
);
```

**Note:** Serializability checks conflict with `FullRouterStateSerializer` — use `MinimalRouterStateSerializer` if enabling them.

---

# @ngrx/effects — Side Effect Management

Effects isolate side effects (HTTP calls, timers, logging) from components, making components pure dispatchers/selectors.

## How Effects Work

1. Listen to the `Actions` stream
2. Filter with `ofType` operator
3. Perform async work (API calls, etc.)
4. Return new actions to dispatch (or nothing for non-dispatching effects)

## Creating Effects

### Class-based Effects

```typescript
import { Injectable, inject } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { catchError, exhaustMap, map, of } from "rxjs";

@Injectable()
export class BooksEffects {
	private actions$ = inject(Actions);
	private booksService = inject(BooksService);

	loadBooks$ = createEffect(() =>
		this.actions$.pipe(
			ofType(BooksPageActions.opened),
			exhaustMap(() =>
				this.booksService.getAll().pipe(
					map((books) => BooksApiActions.booksLoadedSuccess({ books })),
					catchError((error) =>
						of(BooksApiActions.booksLoadedFailure({ errorMsg: error.message })),
					),
				),
			),
		),
	);

	// Non-dispatching effect (e.g., logging)
	logActions$ = createEffect(
		() => this.actions$.pipe(tap((action) => console.log(action))),
		{ dispatch: false },
	);
}
```

### Functional Effects (v15.2+ — Recommended)

```typescript
import { inject } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";

export const loadBooks = createEffect(
	(actions$ = inject(Actions), booksService = inject(BooksService)) =>
		actions$.pipe(
			ofType(BooksPageActions.opened),
			exhaustMap(() =>
				booksService.getAll().pipe(
					map((books) => BooksApiActions.booksLoadedSuccess({ books })),
					catchError((error) =>
						of(BooksApiActions.booksLoadedFailure({ errorMsg: error.message })),
					),
				),
			),
		),
	{ functional: true },
);
```

### Flattening Operator Guide

- `switchMap` — Cancel previous, use latest (search/autocomplete)
- `mergeMap` — Run all in parallel (independent operations)
- `concatMap` — Run sequentially, preserve order (writes/updates)
- `exhaustMap` — Ignore new until current completes (login, form submit)

### Accessing State in Effects

Use `concatLatestFrom` (NOT `withLatestFrom`) to lazily access store:

```typescript
loadBookDetails$ = createEffect(() =>
	this.actions$.pipe(
		ofType(BooksPageActions.bookSelected),
		concatLatestFrom(() => this.store.select(selectSelectedBookId)),
		exhaustMap(([action, bookId]) =>
			this.booksService
				.getDetails(bookId)
				.pipe(map((details) => BooksApiActions.bookDetailsLoaded({ details }))),
		),
	),
);
```

## Registration

```typescript
// Standalone
provideEffects(BooksEffects); // Class-based
provideEffects({ loadBooks, logActions }); // Functional

// Module-based
EffectsModule.forRoot([BooksEffects]);
EffectsModule.forFeature([OtherEffects]);
```

## Lifecycle Hooks

- **ROOT_EFFECTS_INIT** — Dispatched after all root effects are added
- **OnInitEffects** — Dispatch a custom action after effect registration
- **OnRunEffects** — Control effect lifecycle (advanced)
- **OnIdentifyEffects** — Register multiple instances of same effect class

## Error Handling

Effects automatically resubscribe after errors (up to 10 retries by default). Customize via `EFFECTS_ERROR_HANDLER` injection token. Angular's `ErrorHandler` reports the error.

---

# @ngrx/entity — Entity Collection Management

Provides type-safe adapters for normalized entity collections, reducing CRUD boilerplate.

## EntityAdapter

```typescript
import { EntityState, EntityAdapter, createEntityAdapter } from "@ngrx/entity";

export interface Book {
	id: string;
	title: string;
	author: string;
}

export interface BooksState extends EntityState<Book> {
	selectedBookId: string | null;
	loading: boolean;
}

export const booksAdapter: EntityAdapter<Book> = createEntityAdapter<Book>({
	selectId: (book) => book.id, // default: entity.id
	sortComparer: (a, b) => a.title.localeCompare(b.title), // or false for unsorted
});

export const initialState: BooksState = booksAdapter.getInitialState({
	selectedBookId: null,
	loading: false,
});
```

## Adapter Methods (Use in Reducers)

```typescript
const booksReducer = createReducer(
	initialState,
	on(BooksApiActions.booksLoaded, (state, { books }) =>
		booksAdapter.setAll(books, state),
	),
	on(BooksApiActions.bookAdded, (state, { book }) =>
		booksAdapter.addOne(book, state),
	),
	on(
		BooksApiActions.bookUpdated,
		(state, { update }) => booksAdapter.updateOne(update, state), // update: { id: string, changes: Partial<Book> }
	),
	on(BooksApiActions.bookDeleted, (state, { id }) =>
		booksAdapter.removeOne(id, state),
	),
	on(BooksApiActions.booksUpserted, (state, { books }) =>
		booksAdapter.upsertMany(books, state),
	),
);
```

### Full Method List

| Method                                   | Description                           |
| ---------------------------------------- | ------------------------------------- |
| `addOne` / `addMany`                     | Add entities (skip if ID exists)      |
| `setOne` / `setMany` / `setAll`          | Add or replace entities / replace all |
| `removeOne` / `removeMany` / `removeAll` | Remove by ID, predicate, or all       |
| `updateOne` / `updateMany`               | Partial updates via `{ id, changes }` |
| `upsertOne` / `upsertMany`               | Insert or replace (no partial)        |
| `mapOne` / `map`                         | Transform via mapping function        |

## Entity Selectors

```typescript
export const selectBooksState = createFeatureSelector<BooksState>("books");

export const {
	selectIds, // string[] | number[]
	selectEntities, // Dictionary<Book>
	selectAll, // Book[]
	selectTotal, // number
} = booksAdapter.getSelectors(selectBooksState);
```

**Important:** Entities should be plain JavaScript objects, not class instances. NgRx converts class instances to plain objects automatically.

---

# @ngrx/signals — SignalStore (Angular 17+)

The modern, signal-based state management solution. Functional, composable, and tree-shakable.

## signalStore

The `signalStore` function works like a pipe, accepting store feature functions sequentially.

```typescript
import {
	signalStore,
	withState,
	withComputed,
	withMethods,
	withHooks,
} from "@ngrx/signals";
import { patchState } from "@ngrx/signals";
import { computed, inject } from "@angular/core";

export const CounterStore = signalStore(
	{ providedIn: "root" }, // Optional: default is component-level
	withState({ count: 0 }),
	withComputed(({ count }) => ({
		doubleCount: computed(() => count() * 2),
	})),
	withMethods((store) => ({
		increment() {
			patchState(store, { count: store.count() + 1 });
		},
		decrement() {
			patchState(store, (state) => ({ count: state.count - 1 }));
		},
		reset() {
			patchState(store, { count: 0 });
		},
	})),
	withHooks({
		onInit(store) {
			console.log("Store initialized with count:", store.count());
		},
		onDestroy(store) {
			console.log("Store destroyed");
		},
	}),
);
```

### Component Usage

```typescript
@Component({
	selector: "app-counter",
	standalone: true,
	template: `
		<p>Count: {{ store.count() }}</p>
		<p>Double: {{ store.doubleCount() }}</p>
		<button (click)="store.increment()">+</button>
		<button (click)="store.decrement()">-</button>
		<button (click)="store.reset()">Reset</button>
	`,
	providers: [CounterStore], // Component-level (if not providedIn: 'root')
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CounterComponent {
	readonly store = inject(CounterStore);
}
```

## Core Features

### withState — Define State

Creates deep nested signals with lazy Proxy-based access.

```typescript
withState({
	user: {
		firstName: "John",
		lastName: "Doe",
		address: { city: "NYC", country: "US" },
	},
	settings: { theme: "dark" },
});

// Access: store.user.address.city() => 'NYC'
```

### withComputed — Derived State

```typescript
withComputed(({ user }) => ({
	fullName: computed(() => `${user.firstName()} ${user.lastName()}`),
}));
```

Can also inject external dependencies:

```typescript
withComputed(({ user }, otherStore = inject(OtherStore)) => ({
	combined: computed(() => `${user.firstName()} - ${otherStore.value()}`),
}));
```

### withMethods — Public API

```typescript
withMethods((store, http = inject(HttpClient)) => ({
	updateName(firstName: string) {
		patchState(store, (state) => ({
			user: { ...state.user, firstName },
		}));
	},
	loadUser: rxMethod<string>(
		pipe(
			switchMap((id) => http.get<User>(`/api/users/${id}`)),
			tapResponse({
				next: (user) => patchState(store, { user }),
				error: (err) => console.error(err),
			}),
		),
	),
}));
```

### withProps — Shared Non-State Properties (v19+)

Share dependencies, observables, or resources across features:

```typescript
(withProps(() => ({
	_http: inject(HttpClient),
	_router: inject(Router),
})),
	withMethods((store) => ({
		load() {
			return store._http.get("/api/data");
		},
	})));
```

### withHooks — Lifecycle

```typescript
withHooks({
	onInit(store) {
		// Runs when provider is initialized
		store.loadData();
	},
	onDestroy(store) {
		// Cleanup logic
	},
});
```

### patchState — Immutable State Updates

```typescript
// Object partial update
patchState(store, { count: 5 });

// Updater function
patchState(store, (state) => ({ count: state.count + 1 }));

// Multiple updaters
patchState(store, { loading: true }, (state) => ({ count: state.count + 1 }));
```

**Protected state:** By default, `patchState` only works inside `withMethods`. Set `{ protectedState: false }` to allow external updates (not recommended).

### rxMethod — RxJS Integration

Import from `@ngrx/signals/rxjs-interop`. Accepts static values, signals, or observables.

```typescript
import { rxMethod } from "@ngrx/signals/rxjs-interop";
import { debounceTime, distinctUntilChanged, switchMap, pipe } from "rxjs";

withMethods((store, usersService = inject(UsersService)) => ({
	searchUsers: rxMethod<string>(
		pipe(
			debounceTime(300),
			distinctUntilChanged(),
			switchMap((query) => usersService.search(query)),
			tapResponse({
				next: (users) => patchState(store, { users }),
				error: (err) => patchState(store, { error: err.message }),
			}),
		),
	),
}));

// Component usage — all of these work:
store.searchUsers("angular"); // Static value
store.searchUsers(searchSignal); // Signal (re-executes on change)
store.searchUsers(searchInput$); // Observable
```

### withEntities — Entity Management in SignalStore

```typescript
import {
	withEntities,
	setAllEntities,
	addEntity,
	removeEntity,
	updateEntity,
} from "@ngrx/signals/entities";

export const BooksStore = signalStore(
	withEntities<Book>(),
	withMethods((store) => ({
		setBooks(books: Book[]) {
			patchState(store, setAllEntities(books));
		},
		addBook(book: Book) {
			patchState(store, addEntity(book));
		},
		removeBook(id: string) {
			patchState(store, removeEntity(id));
		},
		updateBook(id: string, changes: Partial<Book>) {
			patchState(store, updateEntity({ id, changes }));
		},
	})),
);
```

## Custom Store Features (Extensibility)

The primary power of SignalStore is creating reusable features via `signalStoreFeature`.

```typescript
import { signalStoreFeature, withState, withMethods } from "@ngrx/signals";

// Simple custom feature
export function withLoading() {
	return signalStoreFeature(
		withState({ loading: false, error: null as string | null }),
		withMethods((store) => ({
			setLoading() {
				patchState(store, { loading: true, error: null });
			},
			setLoaded() {
				patchState(store, { loading: false });
			},
			setError(error: string) {
				patchState(store, { loading: false, error });
			},
		})),
	);
}

// Usage in any store
export const ProductsStore = signalStore(
	withState({ products: [] as Product[] }),
	withLoading(), // Adds loading, error state + methods
	withMethods((store) => ({
		loadProducts: rxMethod<void>(
			pipe(
				tap(() => store.setLoading()),
				switchMap(() => inject(ProductsService).getAll()),
				tapResponse({
					next: (products) => {
						patchState(store, { products });
						store.setLoaded();
					},
					error: (err: Error) => store.setError(err.message),
				}),
			),
		),
	})),
);
```

### Dynamic Prefixed Features

For reusing the same feature multiple times with different property names:

```typescript
export function withClipboard<Prefix extends string>(options: {
	prefix: Prefix;
}) {
	const textKey = `${options.prefix}Text` as const;
	const copiedKey = `${options.prefix}Copied` as const;
	const copyKey = `${options.prefix}Copy` as const;

	return signalStoreFeature(
		withState({ [textKey]: "", [copiedKey]: false }),
		withMethods((store, clipboard = inject(Clipboard)) => ({
			[copyKey](value: string) {
				clipboard.copy(value);
				patchState(store, { [textKey]: value, [copiedKey]: true });
			},
		})),
	);
}

// Multi-instance usage
export const MyStore = signalStore(
	withClipboard({ prefix: "name" }), // nameText, nameCopied, nameCopy
	withClipboard({ prefix: "email" }), // emailText, emailCopied, emailCopy
);
```

## signalState — Lightweight Alternative

For simple state without store infrastructure:

```typescript
import { signalState, patchState } from '@ngrx/signals';

@Component({ ... })
export class MyComponent {
  readonly state = signalState({
    count: 0,
    name: 'World',
  });

  increment() {
    patchState(this.state, (s) => ({ count: s.count + 1 }));
  }
}
```

---

# @ngrx/component-store — Component-Level State

Standalone library for managing local/component state as an alternative to "Service with a Subject."

```typescript
import { ComponentStore, tapResponse } from "@ngrx/component-store";
import { Injectable, inject } from "@angular/core";
import { switchMap, tap } from "rxjs";

export interface MoviesState {
	movies: Movie[];
	loading: boolean;
}

@Injectable()
export class MoviesStore extends ComponentStore<MoviesState> {
	private moviesService = inject(MoviesService);

	constructor() {
		super({ movies: [], loading: false }); // Initial state
	}

	// Selectors
	readonly movies$ = this.select((state) => state.movies);
	readonly loading$ = this.select((state) => state.loading);
	readonly vm$ = this.select({ movies: this.movies$, loading: this.loading$ });

	// Updaters (synchronous state changes)
	readonly setMovies = this.updater((state, movies: Movie[]) => ({
		...state,
		movies,
		loading: false,
	}));

	readonly setLoading = this.updater((state) => ({
		...state,
		loading: true,
	}));

	// Effects (async operations)
	readonly loadMovies = this.effect<void>((trigger$) =>
		trigger$.pipe(
			tap(() => this.setLoading()),
			switchMap(() =>
				this.moviesService.getAll().pipe(
					tapResponse(
						(movies) => this.setMovies(movies),
						(error) => console.error(error),
					),
				),
			),
		),
	);
}

// Component usage
@Component({
	providers: [MoviesStore],
	template: `
		@if (store.loading$ | async) {
			<spinner />
		}
		@for (movie of store.movies$ | async; track movie.id) {
			<movie-card [movie]="movie" />
		}
	`,
})
export class MoviesComponent {
	readonly store = inject(MoviesStore);

	ngOnInit() {
		this.store.loadMovies();
	}
}
```

### Key ComponentStore Features

- **setState** — Replace entire state
- **patchState** — Partial state updates
- **select** — Create memoized selectors
- **updater** — Create synchronous state updaters (accepts values or Observables)
- **effect** — Create async side effects
- **Automatic cleanup** — State is destroyed with the component

---

# @ngrx/router-store — Router State Bindings

Connects Angular Router state to the NgRx Store.

```typescript
// Standalone setup
import { provideRouter } from "@angular/router";
import { provideStore } from "@ngrx/store";
import { provideRouterStore, routerReducer } from "@ngrx/router-store";

export const appConfig: ApplicationConfig = {
	providers: [
		provideRouter(routes),
		provideStore({ router: routerReducer }),
		provideRouterStore(),
	],
};

// Selectors
import { getRouterSelectors } from "@ngrx/router-store";

export const {
	selectCurrentRoute,
	selectFragment,
	selectQueryParams,
	selectQueryParam,
	selectRouteParams,
	selectRouteParam,
	selectRouteData,
	selectRouteDataParam,
	selectUrl,
	selectTitle,
} = getRouterSelectors();

// Usage
this.store.select(selectRouteParam("id"));
this.store.select(selectQueryParams);
this.store.select(selectUrl);
```

---

# @ngrx/operators — Utility Operators

### concatLatestFrom

Lazily evaluates a selector only when the source emits (unlike `withLatestFrom` which subscribes eagerly).

```typescript
import { concatLatestFrom } from '@ngrx/operators';

this.actions$.pipe(
  ofType(SomeAction),
  concatLatestFrom(() => this.store.select(selectSomething)),
  map(([action, something]) => /* ... */)
);
```

### tapResponse

Safe response handling for effects that prevents stream termination:

```typescript
import { tapResponse } from "@ngrx/operators";

switchMap(() =>
	this.service.getData().pipe(
		tapResponse(
			(data) => patchState(store, { data }),
			(error: HttpErrorResponse) => patchState(store, { error: error.message }),
			() => patchState(store, { loading: false }), // finalize callback
		),
	),
);
```

---

# @ngrx/schematics — Code Generation

```bash
# Generate store setup
ng generate @ngrx/schematics:store State --root --module app.module.ts

# Generate effect
ng generate @ngrx/schematics:effect App --root --module app.module.ts

# Generate feature (actions + reducer + effects + selectors)
ng generate @ngrx/schematics:feature books

# Generate entity feature
ng generate @ngrx/schematics:entity books --module books.module.ts

# Generate action
ng generate @ngrx/schematics:action books

# Generate reducer
ng generate @ngrx/schematics:reducer books

# Generate selector
ng generate @ngrx/schematics:selector books

# Generate effect
ng generate @ngrx/schematics:effect books

# Generate container component
ng generate @ngrx/schematics:container books
```

---

# @ngrx/eslint-plugin — Linting Rules

## Configuration Presets

- `recommended` — Balanced set of rules
- `all` — All rules enabled
- `strict` — Strictest enforcement
- Category-specific: `store`, `effects`, `component-store` (each with `-strict` variants)

## Key Rules

### Store Rules (17 rules)

- Combine selectors at selector level, not component
- Use async pipe over manual subscriptions
- Enforce action creator patterns
- Consistent naming (e.g., `select` prefix for selectors)
- Prevent multiple global store instances

### Effects Rules (8 rules)

- Prevent cyclic effects
- Recommend `concatLatestFrom` over `withLatestFrom`
- Use action creators (not strings) in `ofType`
- Proper lifecycle interface implementation
- No `store.dispatch()` inside effects

### ComponentStore Rules

- Require explicit return types on updaters

```json
// .eslintrc.json
{
	"extends": ["plugin:@ngrx/recommended"]
}
```

---

# Best Practices Summary

## File/Folder Structure

```
feature/
  actions/
    feature.actions.ts        (or feature-page.actions.ts + feature-api.actions.ts)
  reducers/
    feature.reducer.ts
  selectors/
    feature.selectors.ts
  effects/
    feature.effects.ts
  models/
    feature.model.ts
  feature.module.ts           (or feature.routes.ts for standalone)
```

## Action Best Practices

- Name actions as events: `[Books Page] Search Changed`, not `Search Books`
- Separate page actions from API actions: `BooksPageActions`, `BooksApiActions`
- Use `createActionGroup` for related actions
- Include descriptive payloads for debugging

## Reducer Best Practices

- Keep reducers pure and synchronous
- Use `createFeature` to auto-generate selectors
- Handle all edge cases (loading, error, empty states)
- Use `@ngrx/entity` adapter for collection CRUD

## Selector Best Practices

- Compose selectors from smaller selectors
- Use selector factories for parameterized queries
- Release selectors when managing large datasets
- Never compute derived state in components — use selectors

## Effects Best Practices

- Use functional effects (`{ functional: true }`) for new code
- Choose the right flattening operator (switch/merge/concat/exhaust)
- Always handle errors inside the flattening operator (catchError)
- Use `concatLatestFrom` (not `withLatestFrom`) for state access
- Use `tapResponse` for safe error handling

## SignalStore Best Practices

- For new Angular 17+ projects, prefer SignalStore over global Store
- Create custom reusable features with `signalStoreFeature`
- Use `rxMethod` for async operations with RxJS
- Use `patchState` for all state updates (never mutate directly)
- Keep stores focused — one store per feature/domain
- Both global Store and SignalStore can coexist in the same project

## Testing

```typescript
// Testing selectors (pure functions — easy!)
it("should select all books", () => {
	const state: BooksState = { books: [mockBook], loading: false, error: null };
	expect(selectAllBooks.projector(state)).toEqual([mockBook]);
});

// Testing reducers
it("should set loading on page opened", () => {
	const result = booksReducer(initialState, BooksPageActions.opened());
	expect(result.loading).toBe(true);
});

// Testing effects with provideMockActions
TestBed.configureTestingModule({
	providers: [
		BooksEffects,
		provideMockActions(() => actions$),
		{ provide: BooksService, useValue: mockBooksService },
	],
});
```

---

# Migration Guide: Choosing the Right NgRx Package

| Scenario                                      | Recommended Package                                                  |
| --------------------------------------------- | -------------------------------------------------------------------- |
| New Angular 17+ project, simple state         | `@ngrx/signals` (SignalStore)                                        |
| New Angular 17+ project, complex shared state | `@ngrx/signals` + `@ngrx/store` (hybrid)                             |
| Existing NgRx Store project                   | Keep `@ngrx/store`, gradually introduce SignalStore for new features |
| Component-local state only                    | `@ngrx/signals` (signalState) or `@ngrx/component-store`             |
| Large entity collections                      | `@ngrx/entity` (with Store) or `withEntities` (with SignalStore)     |
| Need DevTools debugging                       | `@ngrx/store` + `@ngrx/store-devtools`                               |
