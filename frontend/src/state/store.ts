import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TypeFilter = 'all' | 'note' | 'file';

interface NavigationState {
  history: string[];
  currentIndex: number;
}

interface FiltersState {
  searchQuery: string;
  typeFilter: TypeFilter;
  selectedTags: string[];
}

interface VaultState {
  currentResourceId: string | null;
  navigation: NavigationState;
  filters: FiltersState;
}

const initialState: VaultState = {
  currentResourceId: null,
  navigation: {
    history: [],
    currentIndex: -1,
  },
  filters: {
    searchQuery: '',
    typeFilter: 'all',
    selectedTags: [],
  },
};

const vaultSlice = createSlice({
  name: 'vault',
  initialState,
  reducers: {
    openResource(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.navigation.history[state.navigation.currentIndex] !== id) {
        state.navigation.history = state.navigation.history.slice(0, state.navigation.currentIndex + 1);
        state.navigation.history.push(id);
        state.navigation.currentIndex += 1;
      }
      state.currentResourceId = id;
    },
    navigateBack(state) {
      if (state.navigation.currentIndex <= 0) return;
      state.navigation.currentIndex -= 1;
      state.currentResourceId = state.navigation.history[state.navigation.currentIndex] ?? null;
    },
    navigateForward(state) {
      if (state.navigation.currentIndex >= state.navigation.history.length - 1) return;
      state.navigation.currentIndex += 1;
      state.currentResourceId = state.navigation.history[state.navigation.currentIndex] ?? null;
    },
    setCurrentResourceId(state, action: PayloadAction<string | null>) {
      state.currentResourceId = action.payload;
    },
    removeResourceFromState(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.navigation.history = state.navigation.history.filter((entry) => entry !== id);
      state.navigation.currentIndex = Math.min(state.navigation.currentIndex, state.navigation.history.length - 1);
      if (state.currentResourceId === id) {
        state.currentResourceId = state.navigation.currentIndex >= 0
          ? state.navigation.history[state.navigation.currentIndex] ?? null
          : null;
      }
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.filters.searchQuery = action.payload;
    },
    setTypeFilter(state, action: PayloadAction<TypeFilter>) {
      state.filters.typeFilter = action.payload;
    },
    toggleSelectedTag(state, action: PayloadAction<string>) {
      const tagName = action.payload;
      if (state.filters.selectedTags.includes(tagName)) {
        state.filters.selectedTags = state.filters.selectedTags.filter((tag) => tag !== tagName);
        return;
      }
      state.filters.selectedTags.push(tagName);
    },
    clearSelectedTags(state) {
      state.filters.selectedTags = [];
    },
    removeSelectedTag(state, action: PayloadAction<string>) {
      state.filters.selectedTags = state.filters.selectedTags.filter((tag) => tag !== action.payload);
    },
  },
});

export const {
  openResource,
  navigateBack,
  navigateForward,
  setCurrentResourceId,
  removeResourceFromState,
  setSearchQuery,
  setTypeFilter,
  toggleSelectedTag,
  clearSelectedTags,
  removeSelectedTag,
} = vaultSlice.actions;

export const store = configureStore({
  reducer: {
    vault: vaultSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
