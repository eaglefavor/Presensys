import { create } from 'zustand';

export interface UiState {
  // Navigation
  currentView: string;
  
  // Modal states
  isBlitzActive: boolean;
  isAiCommandBarVisible: boolean;
  
  // Filters and search
  activeCourseFilter: string | null;
  searchQuery: string;
  
  // Actions
  setNavigation: (route: string) => void;
  triggerBlitzModal: (open: boolean) => void;
  setAiCommandBarVisibility: (visible: boolean) => void;
  setCourseFilter: (courseCode: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  // Initial state
  currentView: '/dashboard',
  isBlitzActive: false,
  isAiCommandBarVisible: false,
  activeCourseFilter: null,
  searchQuery: '',
  
  // Actions
  setNavigation: (route: string) => {
    set({ currentView: route });
  },
  
  triggerBlitzModal: (open: boolean) => {
    set({ isBlitzActive: open });
  },
  
  setAiCommandBarVisibility: (visible: boolean) => {
    set({ isAiCommandBarVisible: visible });
  },
  
  setCourseFilter: (courseCode: string | null) => {
    set({ activeCourseFilter: courseCode });
  },
  
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },
}));
