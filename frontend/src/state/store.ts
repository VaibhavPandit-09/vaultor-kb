import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TypeFilter = 'all' | 'note' | 'file';

interface FiltersState {
  searchQuery: string;
  typeFilter: TypeFilter;
  selectedTags: string[];
}

interface VaultState {
  currentResourceId: string | null;
  filters: FiltersState;
}

const initialState: VaultState = {
  currentResourceId: null,
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
    setCurrentResourceId(state, action: PayloadAction<string | null>) {
      state.currentResourceId = action.payload;
    },
    removeResourceFromState(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.currentResourceId === id) state.currentResourceId = null;
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
