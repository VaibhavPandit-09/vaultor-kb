import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Sun,
  Moon,
  LogOut,
  Trash2,
  Database,
  UploadCloud,
  DownloadCloud,
  X,
  FileText,
  Paperclip,
  ChevronDown,
  Upload,
  AlertTriangle,
  Loader2,
  Command,
  Tag as TagIcon,
  Settings2,
} from 'lucide-react';
import api from '../lib/api';
import type { Resource, Tag, ResourceType } from '../types';
import { isPreviewResource } from '../types';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import BlockEditor, { type NoteSelection } from '../components/editor/BlockEditor';
import PreviewLayer from '../components/PreviewLayer';
import { markdownToHtml } from '../components/editor/markdownUtils';
import { csvToTableHtml } from '../components/editor/csvUtils';
import AppModal from '../components/modals/AppModal';
import CommandPaletteModal from '../components/modals/CommandPaletteModal';
import ShortcutsModal from '../components/modals/ShortcutsModal';
import SettingsModal from '../components/modals/SettingsModal';
import { isMac, shortcutMatchesEvent } from '../lib/shortcuts';
import type { CommandContext } from '../lib/commandPalette';
import {
  clearSelectedTags,
  navigateBack,
  navigateForward,
  openResource as openResourceAction,
  removeResourceFromState,
  removeSelectedTag,
  setCurrentResourceId,
  setTypeFilter,
  toggleSelectedTag,
} from '../state/store';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../lib/escape/escape';
import { useSettings } from '../lib/settings';

type TypeFilter = 'all' | 'note' | 'file';

interface DeleteModalState {
  id: string;
  title: string;
  backlinks: Resource[];
}

interface OpenNote {
  id: string;
  selection?: NoteSelection;
}

type PreviewSnapshot = {
  resourceId: string | null;
  resourceType: ResourceType | null;
  overrideMode: 'side' | 'modal' | null;
};

const SIDEBAR_STORAGE_KEY = 'vaultor_sidebar_collapsed';

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const currentResourceId = useAppSelector((state) => state.vault.currentResourceId);
  const navigation = useAppSelector((state) => state.vault.navigation);
  const filters = useAppSelector((state) => state.vault.filters);

  const [resources, setResources] = useState<Resource[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [resourceDetails, setResourceDetails] = useState<Record<string, Resource>>({});
  const [openNotes, setOpenNotes] = useState<OpenNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [focusRestoreNoteId, setFocusRestoreNoteId] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<Resource[]>([]);
  const [loadingResourceIds, setLoadingResourceIds] = useState<string[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  });

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewResourceId, setPreviewResourceId] = useState<string | null>(null);
  const [previewResourceType, setPreviewResourceType] = useState<ResourceType | null>(null);
  const [previewOverrideMode, setPreviewOverrideMode] = useState<'side' | 'modal' | null>(null);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');

  const [authModal, setAuthModal] = useState<'export' | 'import' | null>(null);
  const [authPassword, setAuthPassword] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [importSuccessOpen, setImportSuccessOpen] = useState(false);

  const [createNotePending, setCreateNotePending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [replacePending, setReplacePending] = useState(false);
  const [tagDeletePending, setTagDeletePending] = useState(false);
  const [tagAddPending, setTagAddPending] = useState(false);

  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [replaceLinkModal, setReplaceLinkModal] = useState<{ oldId: string; title: string; backlinks: Resource[] } | null>(null);
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceResults, setReplaceResults] = useState<Resource[]>([]);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [tagDeleteModal, setTagDeleteModal] = useState<{ id: string; name: string } | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const mdUploadRef = useRef<HTMLInputElement>(null);
  const csvUploadRef = useRef<HTMLInputElement>(null);
  const latestNoteContentRef = useRef<string | null>(null);
  const commandPalettePreviewRef = useRef<PreviewSnapshot | null>(null);
  const floatingSidebarHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleEditDismissRef = useRef<'save' | 'cancel' | null>(null);
  const [floatingSidebarHovered, setFloatingSidebarHovered] = useState(false);
  const [floatingSidebarPinned, setFloatingSidebarPinned] = useState(false);
  const [titleEditState, setTitleEditState] = useState<{ noteId: string; value: string; original: string } | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const { settings, resolvedShortcuts, toggleTheme } = useSettings();
  const commandPaletteFocus = useRestoreFocusOnClose();
  const shortcutsModalFocus = useRestoreFocusOnClose();
  const settingsModalFocus = useRestoreFocusOnClose();
  const previewFocus = useRestoreFocusOnClose();
  const workspaceSettings = settings.workspace;
  const localSettings = settings.local;
  const effectivePreviewMode = previewOverrideMode ?? localSettings.previewMode;
  const isFloatingSidebarMode = localSettings.sidebarMode === 'floating';
  const fixedSidebarHidden = workspaceSettings.focusMode || (isFloatingSidebarMode ? true : sidebarCollapsed);
  const floatingSidebarVisible = !workspaceSettings.focusMode && isFloatingSidebarMode && (floatingSidebarPinned || floatingSidebarHovered);
  const sidebarCollapsedForContext = isFloatingSidebarMode ? !floatingSidebarVisible : sidebarCollapsed;
  const selectedResource = useMemo(() => {
    if (!currentResourceId) {
      return null;
    }

    return resourceDetails[currentResourceId] ?? resources.find((resource) => resource.id === currentResourceId) ?? null;
  }, [currentResourceId, resourceDetails, resources]);
  const previewResource = useMemo(() => {
    if (!previewResourceId) {
      return null;
    }

    return resourceDetails[previewResourceId] ?? resources.find((resource) => resource.id === previewResourceId) ?? null;
  }, [previewResourceId, resourceDetails, resources]);
  const workspaceResource = useMemo(() => {
    if (!activeNoteId) {
      return null;
    }

    return resourceDetails[activeNoteId] ?? resources.find((resource) => resource.id === activeNoteId) ?? null;
  }, [activeNoteId, resourceDetails, resources]);
  const activeResource = previewResource ?? workspaceResource ?? selectedResource;
  const activeResourceLoading = Boolean(currentResourceId && !selectedResource && loadingResourceIds.includes(currentResourceId));
  const previewResourceLoading = Boolean(previewResourceId && !previewResource && loadingResourceIds.includes(previewResourceId));

  useEscapeLayer({
    id: 'dashboard-type-filter',
    active: showTypeDropdown,
    priority: ESCAPE_PRIORITIES.popover,
    close: () => setShowTypeDropdown(false),
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const clearFloatingSidebarHideTimeout = useCallback(() => {
    if (floatingSidebarHideTimeoutRef.current) {
      clearTimeout(floatingSidebarHideTimeoutRef.current);
      floatingSidebarHideTimeoutRef.current = null;
    }
  }, []);

  const showFloatingSidebar = useCallback(() => {
    clearFloatingSidebarHideTimeout();
    setFloatingSidebarHovered(true);
  }, [clearFloatingSidebarHideTimeout]);

  const scheduleFloatingSidebarHide = useCallback(() => {
    clearFloatingSidebarHideTimeout();
    if (floatingSidebarPinned) {
      return;
    }

    floatingSidebarHideTimeoutRef.current = setTimeout(() => {
      setFloatingSidebarHovered(false);
    }, 180);
  }, [clearFloatingSidebarHideTimeout, floatingSidebarPinned]);

  useEffect(() => {
    clearFloatingSidebarHideTimeout();
    setFloatingSidebarHovered(false);
    setFloatingSidebarPinned(false);
  }, [clearFloatingSidebarHideTimeout, localSettings.sidebarMode]);

  useEffect(() => {
    return () => {
      clearFloatingSidebarHideTimeout();
    };
  }, [clearFloatingSidebarHideTimeout]);

  useEffect(() => {
    if (!titleEditState) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [titleEditState]);

  const fetchData = useCallback(async () => {
    setSidebarLoading(true);
    try {
      const [resData, tagsData] = await Promise.all([api.get('/resources'), api.get('/tags')]);
      setResources(resData.data || []);
      setTags(tagsData.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setSidebarLoading(false);
    }
  }, []);

  const fetchResourceDetails = useCallback(async (id: string) => {
    setLoadingResourceIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      const { data } = await api.get(`/resources/${id}`);
      setResourceDetails((prev) => ({ ...prev, [id]: data }));
      return data as Resource;
    } catch (error) {
      console.error(error);
      return null;
    } finally {
      setLoadingResourceIds((prev) => prev.filter((entry) => entry !== id));
    }
  }, []);

  const fetchBacklinks = useCallback(async (id: string) => {
    try {
      const { data } = await api.get(`/resources/${id}/backlinks`);
      setBacklinks(data || []);
    } catch (error) {
      console.error(error);
      setBacklinks([]);
    }
  }, []);

  const markOpened = useCallback((id: string) => {
    api.post(`/resources/${id}/open`).catch(() => {});
  }, []);

  const dismissPreview = useCallback((options?: { restoreFocus?: boolean; clearSelection?: boolean }) => {
    setPreviewResourceId(null);
    setPreviewResourceType(null);
    setPreviewOverrideMode(null);
    if (options?.clearSelection !== false) {
      dispatch(setCurrentResourceId(activeNoteId ?? null));
    }
    if (options?.restoreFocus !== false) {
      previewFocus.restoreFocus();
    }
  }, [activeNoteId, dispatch, previewFocus]);

  const openPreview = useCallback((resource: Resource) => {
    previewFocus.captureFocus();
    setPreviewResourceId(resource.id);
    setPreviewResourceType(resource.type);
    setPreviewOverrideMode(null);
    void fetchResourceDetails(resource.id);
  }, [fetchResourceDetails, previewFocus]);

  const togglePreviewMode = useCallback(() => {
    setPreviewOverrideMode((current) => {
      const currentMode = current ?? localSettings.previewMode;
      return currentMode === 'modal' ? 'side' : 'modal';
    });
  }, [localSettings.previewMode]);

  const openResourceById = useCallback((id: string, options?: { focus?: boolean }) => {
    const resourceMeta = resources.find((resource) => resource.id === id);
    if (resourceMeta && isPreviewResource(resourceMeta.type)) {
      openPreview(resourceMeta);
      dispatch(openResourceAction(id));
      markOpened(id);
      return;
    }

    if (resourceMeta?.type === 'note') {
      setOpenNotes((prev) => {
        return upsertOpenNote(prev, id, workspaceSettings.maxOpenNotes, workspaceSettings.openBehavior);
      });
      setActiveNoteId(id);
      if (options?.focus !== false) {
        setFocusRestoreNoteId(id);
      }
      dismissPreview({ restoreFocus: false });
      void fetchResourceDetails(id);
    }

    dispatch(openResourceAction(id));
    markOpened(id);
  }, [dismissPreview, dispatch, fetchResourceDetails, markOpened, openPreview, resources, workspaceSettings.maxOpenNotes, workspaceSettings.openBehavior]);

  const activateOpenNote = useCallback((id: string, options?: { focus?: boolean }) => {
    setActiveNoteId(id);
    if (options?.focus) {
      setFocusRestoreNoteId(id);
    }
    dispatch(setCurrentResourceId(id));
    markOpened(id);
  }, [dispatch, markOpened]);

  const toggleSidebar = useCallback(() => {
    if (localSettings.sidebarMode === 'floating') {
      clearFloatingSidebarHideTimeout();
      setFloatingSidebarPinned((current) => {
        const next = !current;
        setFloatingSidebarHovered(next);
        return next;
      });
      return;
    }

    setSidebarCollapsed((prev) => !prev);
  }, [clearFloatingSidebarHideTimeout, localSettings.sidebarMode]);

  const restoreCommandPalettePreview = useCallback((snapshot: PreviewSnapshot | null) => {
    if (!snapshot?.resourceId || !snapshot.resourceType) {
      setPreviewResourceId(null);
      setPreviewResourceType(null);
      setPreviewOverrideMode(null);
      return;
    }

    setPreviewResourceId(snapshot.resourceId);
    setPreviewResourceType(snapshot.resourceType);
    setPreviewOverrideMode(snapshot.overrideMode);

    if (!resourceDetails[snapshot.resourceId]) {
      void fetchResourceDetails(snapshot.resourceId);
    }
  }, [fetchResourceDetails, resourceDetails]);

  const openCommandPalette = useCallback(() => {
    commandPaletteFocus.captureFocus();
    commandPalettePreviewRef.current = {
      resourceId: previewResourceId,
      resourceType: previewResourceType,
      overrideMode: previewOverrideMode,
    };
    if (previewResourceId && previewResourceType) {
      setPreviewOverrideMode('side');
    }
    setCommandPaletteOpen(true);
  }, [commandPaletteFocus, previewOverrideMode, previewResourceId, previewResourceType]);

  const closeCommandPalette = useCallback((options?: { restorePreview?: boolean; restoreFocus?: boolean }) => {
    setCommandPaletteOpen(false);
    if (options?.restorePreview !== false) {
      restoreCommandPalettePreview(commandPalettePreviewRef.current);
    }
    commandPalettePreviewRef.current = null;
    if (options?.restoreFocus !== false) {
      commandPaletteFocus.restoreFocus();
    }
  }, [commandPaletteFocus, restoreCommandPalettePreview]);

  const highlightCommandPalettePreviewResource = useCallback((resourceId: string | null) => {
    if (!commandPaletteOpen) {
      return;
    }

    if (!resourceId) {
      restoreCommandPalettePreview(commandPalettePreviewRef.current);
      return;
    }

    const previewTarget = resources.find((resource) => resource.id === resourceId);
    if (!previewTarget || !isPreviewResource(previewTarget.type)) {
      restoreCommandPalettePreview(commandPalettePreviewRef.current);
      return;
    }

    setPreviewResourceId(previewTarget.id);
    setPreviewResourceType(previewTarget.type);
    setPreviewOverrideMode('side');

    if (!resourceDetails[previewTarget.id]) {
      void fetchResourceDetails(previewTarget.id);
    }
  }, [commandPaletteOpen, fetchResourceDetails, resourceDetails, resources, restoreCommandPalettePreview]);

  const openShortcutsModal = useCallback(() => {
    shortcutsModalFocus.captureFocus();
    setShortcutsOpen(true);
  }, [shortcutsModalFocus]);

  const closeShortcutsModal = useCallback(() => {
    setShortcutsOpen(false);
    shortcutsModalFocus.restoreFocus();
  }, [shortcutsModalFocus]);

  const openSettingsModal = useCallback(() => {
    settingsModalFocus.captureFocus();
    setSettingsOpen(true);
  }, [settingsModalFocus]);

  const closeSettingsModal = useCallback(() => {
    setSettingsOpen(false);
    settingsModalFocus.restoreFocus();
  }, [settingsModalFocus]);

  const saveNoteSelection = useCallback((noteId: string, selection: NoteSelection) => {
    setOpenNotes((prev) => prev.map((note) => (
      note.id === noteId ? { ...note, selection } : note
    )));
  }, []);

  const handleNoteFocusRestored = useCallback((noteId: string) => {
    setFocusRestoreNoteId((current) => (current === noteId ? null : current));
  }, []);

  const switchNote = useCallback((direction: 'next' | 'prev') => {
    if (openNotes.length < 2 || !activeNoteId) {
      return;
    }

    const index = openNotes.findIndex((note) => note.id === activeNoteId);
    if (index === -1) {
      return;
    }

    const nextIndex = direction === 'next'
      ? (index + 1) % openNotes.length
      : (index - 1 + openNotes.length) % openNotes.length;

    activateOpenNote(openNotes[nextIndex].id, { focus: true });
  }, [activateOpenNote, activeNoteId, openNotes]);

  const closeActiveNote = useCallback(() => {
    if (!activeNoteId) {
      return;
    }

    setOpenNotes((prev) => {
      const filtered = prev.filter((note) => note.id !== activeNoteId);
      const nextActiveId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;

      setActiveNoteId(nextActiveId);
      setFocusRestoreNoteId(nextActiveId);
      dispatch(setCurrentResourceId(nextActiveId));

      return filtered;
    });
  }, [activeNoteId, dispatch]);

  const handleBackNavigation = useCallback(() => {
    if (navigation.currentIndex <= 0) return;
    const previousId = navigation.history[navigation.currentIndex - 1];
    dispatch(navigateBack());
    if (previousId) markOpened(previousId);
  }, [dispatch, markOpened, navigation.currentIndex, navigation.history]);

  const handleForwardNavigation = useCallback(() => {
    if (navigation.currentIndex >= navigation.history.length - 1) return;
    const nextId = navigation.history[navigation.currentIndex + 1];
    dispatch(navigateForward());
    if (nextId) markOpened(nextId);
  }, [dispatch, markOpened, navigation.currentIndex, navigation.history]);

  const handleCreateNote = useCallback(async () => {
    if (createNotePending) return;
    setCreateNotePending(true);
    try {
      const { data } = await api.post('/resources', {
        type: 'note',
        title: 'Untitled Note',
        content: { type: 'doc', content: [] },
      });
      await fetchData();
      openResourceById(data.id);
    } catch (error) {
      console.error(error);
    } finally {
      setCreateNotePending(false);
    }
  }, [createNotePending, fetchData, openResourceById]);

  const handleUploadFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || uploadPending) return;

    setUploadPending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/resources/file', formData);
      await fetchData();
      openResourceById(data.id);
    } catch (error) {
      console.error(error);
    } finally {
      setUploadPending(false);
      if (fileUploadRef.current) fileUploadRef.current.value = '';
    }
  }, [fetchData, openResourceById, uploadPending]);

  const requestFileUpload = useCallback(() => {
    if (fileUploadRef.current) {
      fileUploadRef.current.value = '';
      fileUploadRef.current.click();
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setOpenNotes((prev) => limitOpenNotes(prev, workspaceSettings.maxOpenNotes));
  }, [workspaceSettings.maxOpenNotes]);

  useEffect(() => {
    if (activeNoteId && openNotes.some((note) => note.id === activeNoteId)) {
      return;
    }

    const nextActiveId = openNotes[openNotes.length - 1]?.id ?? null;
    if (nextActiveId === activeNoteId) {
      return;
    }

    setActiveNoteId(nextActiveId);
    setFocusRestoreNoteId(nextActiveId);
    dispatch(setCurrentResourceId(nextActiveId));
  }, [activeNoteId, dispatch, openNotes]);

  useEffect(() => {
    if (!currentResourceId) {
      setBacklinks([]);
      return;
    }

    void fetchResourceDetails(currentResourceId);
    const resourceMeta = selectedResource;

    if (resourceMeta?.type === 'note') {
      setActiveNoteId(currentResourceId);
      void fetchBacklinks(currentResourceId);
      setOpenNotes((prev) => {
        return upsertOpenNote(prev, currentResourceId, workspaceSettings.maxOpenNotes, workspaceSettings.openBehavior);
      });
      return;
    }

    setBacklinks([]);
  }, [currentResourceId, fetchBacklinks, fetchResourceDetails, selectedResource, workspaceSettings.maxOpenNotes, workspaceSettings.openBehavior]);

  useEffect(() => {
    if (activeResource?.type === 'note') {
      latestNoteContentRef.current =
        typeof activeResource.content === 'string'
          ? activeResource.content
          : JSON.stringify(activeResource.content ?? { type: 'doc', content: [] });
      return;
    }

    latestNoteContentRef.current = null;
  }, [activeResource]);

  useEffect(() => {
    (window as any).__openResource = (resourceId: string) => {
      openResourceById(resourceId);
    };

    return () => {
      (window as any).__openResource = undefined;
    };
  }, [openResourceById]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = Boolean(
        target?.closest('[contenteditable="true"]') ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      );

      if (shortcutMatchesEvent(resolvedShortcuts.commandPalette, event)) {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if (shortcutMatchesEvent(resolvedShortcuts.switchNoteNext, event)) {
        event.preventDefault();
        switchNote('next');
        return;
      }

      if (shortcutMatchesEvent(resolvedShortcuts.switchNotePrevious, event)) {
        event.preventDefault();
        switchNote('prev');
        return;
      }

      if (shortcutMatchesEvent(resolvedShortcuts.closeActiveNote, event)) {
        event.preventDefault();
        closeActiveNote();
        return;
      }

      if (shortcutMatchesEvent(resolvedShortcuts.toggleSidebar, event)) {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      if (shortcutMatchesEvent(resolvedShortcuts.openShortcuts, event) || (!isEditable && event.key === '?')) {
        event.preventDefault();
        openShortcutsModal();
        return;
      }

      if (isMac && event.metaKey && event.key === '[') {
        event.preventDefault();
        handleBackNavigation();
        return;
      }

      if (isMac && event.metaKey && event.key === ']') {
        event.preventDefault();
        handleForwardNavigation();
        return;
      }

      if (!isMac && event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        handleBackNavigation();
        return;
      }

      if (!isMac && event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        handleForwardNavigation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeActiveNote, handleBackNavigation, handleForwardNavigation, openCommandPalette, openShortcutsModal, resolvedShortcuts, switchNote, toggleSidebar]);

  useEffect(() => {
    if (!replaceLinkModal || !replaceSearch.trim()) {
      setReplaceResults([]);
      setReplaceLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setReplaceLoading(true);
      try {
        const { data } = await api.get(`/resources/search?q=${encodeURIComponent(replaceSearch)}`);
        if (!active) return;
        setReplaceResults((data || []).filter((resource: Resource) => resource.id !== replaceLinkModal.oldId));
      } catch (error) {
        console.error(error);
        if (active) setReplaceResults([]);
      } finally {
        if (active) setReplaceLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [replaceLinkModal, replaceSearch]);

  const handleDeleteResource = async (id: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      const { data: linkedFrom } = await api.get(`/resources/${id}/backlinks`);
      const resource = resources.find((item) => item.id === id);
      setDeleteModal({
        id,
        title: resource?.title || 'Resource',
        backlinks: linkedFrom || [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const executeDelete = async (id: string) => {
    setDeletePending(true);
    try {
      await api.delete(`/resources/${id}`);
      if (previewResourceId === id) {
        dismissPreview({ restoreFocus: false });
      }
      setResources((prev) => prev.filter((resource) => resource.id !== id));
      setResourceDetails((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setOpenNotes((prev) => prev.filter((note) => note.id !== id));
      dispatch(removeResourceFromState(id));
      if (currentResourceId === id) {
        const remainingNotes = openNotes.filter((note) => note.id !== id);
        const nextActiveId = remainingNotes.length > 0 ? remainingNotes[remainingNotes.length - 1].id : null;
        setActiveNoteId(nextActiveId);
        setFocusRestoreNoteId(nextActiveId);
        dispatch(setCurrentResourceId(nextActiveId));
      }
      setDeleteModal(null);
    } catch (error) {
      console.error(error);
    } finally {
      setDeletePending(false);
    }
  };

  const executeReplaceLinks = async (newId: string) => {
    if (!replaceLinkModal) return;
    setReplacePending(true);
    try {
      await api.post(`/resources/${replaceLinkModal.oldId}/replace-links`, { newResourceId: newId });
      setReplaceLinkModal(null);
      setDeleteModal(null);
      setReplaceSearch('');
      setReplaceResults([]);
      await fetchData();
      if (currentResourceId === replaceLinkModal.oldId) {
        openResourceById(newId);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setReplacePending(false);
    }
  };

  const renameResource = useCallback(async (resourceId: string, title: string) => {
    const resource = resourceDetails[resourceId] ?? resources.find((entry) => entry.id === resourceId) ?? null;
    if (!resource || resource.type !== 'note') {
      return;
    }

    setResourceDetails((prev) => ({
      ...prev,
      [resourceId]: { ...resource, title },
    }));

    try {
      await api.put(`/resources/${resourceId}/note`, {
        title,
        content: typeof resource.content === 'string'
          ? resource.content
          : JSON.stringify(resource.content ?? { type: 'doc', content: [] }),
      });
      void fetchData();
    } catch (error) {
      console.error(error);
    }
  }, [fetchData, resourceDetails, resources]);

  const startTitleEditing = useCallback((noteId: string, title: string) => {
    activateOpenNote(noteId);
    titleEditDismissRef.current = null;
    setTitleEditState({
      noteId,
      value: title,
      original: title,
    });
  }, [activateOpenNote]);

  const cancelTitleEditing = useCallback(() => {
    titleEditDismissRef.current = 'cancel';
    setTitleEditState(null);
  }, []);

  const commitTitleEditing = useCallback(async () => {
    if (!titleEditState) {
      return;
    }

    titleEditDismissRef.current = 'save';
    const nextTitle = titleEditState.value.trim() || titleEditState.original || 'Untitled Note';
    await renameResource(titleEditState.noteId, nextTitle);
    titleEditDismissRef.current = null;
    setTitleEditState(null);
  }, [renameResource, titleEditState]);

  const handleContentUpdate = async (noteId: string, json: unknown) => {
    const noteResource = resourceDetails[noteId] ?? (activeResource?.id === noteId ? activeResource : null);
    if (!noteResource || noteResource.type !== 'note') return;
    const contentStr = JSON.stringify(json);
    if (activeResource?.id === noteId) {
      latestNoteContentRef.current = contentStr;
    }
    setResourceDetails((prev) => ({
      ...prev,
      [noteId]: {
        ...noteResource,
        content: contentStr,
      },
    }));
    try {
      await api.put(`/resources/${noteId}/note`, { title: noteResource.title, content: contentStr });
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddTag = async (tagName: string) => {
    if (!activeResource || !tagName.trim()) return;
    setTagAddPending(true);
    try {
      await api.post(`/resources/${activeResource.id}/tags/${encodeURIComponent(tagName.trim())}`);
      await fetchResourceDetails(activeResource.id);
      await fetchBacklinks(activeResource.id);
      await fetchData();
      setTagInputOpen(false);
      setTagInputValue('');
    } catch (error) {
      console.error(error);
    } finally {
      setTagAddPending(false);
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    if (!activeResource) return;
    try {
      await api.delete(`/resources/${activeResource.id}/tags/${encodeURIComponent(tagName.trim())}`);
      void fetchResourceDetails(activeResource.id);
      void fetchBacklinks(activeResource.id);
      void fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const executeDeleteTag = async () => {
    if (!tagDeleteModal) return;
    setTagDeletePending(true);
    try {
      await api.delete(`/tags/${tagDeleteModal.id}`);
      dispatch(removeSelectedTag(tagDeleteModal.name));
      await fetchData();
      if (activeResource) {
        await fetchResourceDetails(activeResource.id);
        if (activeResource.type === 'note') {
          await fetchBacklinks(activeResource.id);
        }
      }
      setTagDeleteModal(null);
    } catch (error) {
      console.error(error);
    } finally {
      setTagDeletePending(false);
    }
  };

  const handleRequestMdUpload = useCallback(() => {
    if (mdUploadRef.current) {
      mdUploadRef.current.value = '';
      mdUploadRef.current.click();
    }
  }, []);

  const handleRequestCsvUpload = useCallback(() => {
    if (csvUploadRef.current) {
      csvUploadRef.current.value = '';
      csvUploadRef.current.click();
    }
  }, []);

  const handleMdFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const html = markdownToHtml(text);
      const editor = (window as any).__vaultor_editor;
      if (editor) editor.chain().focus().insertContent(html).run();
    } catch (error) {
      console.error('MD upload failed:', error);
    }
    if (mdUploadRef.current) mdUploadRef.current.value = '';
  }, []);

  const handleCsvFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const html = csvToTableHtml(text);
      const editor = (window as any).__vaultor_editor;
      if (editor) editor.chain().focus().insertContent(html).run();
    } catch (error) {
      console.error('CSV upload failed:', error);
    }
    if (csvUploadRef.current) csvUploadRef.current.value = '';
  }, []);

  const handleFileDownload = useCallback(async () => {
    if (!activeResource || activeResource.type !== 'file') return;
    try {
      const res = await api.get(`/resources/${activeResource.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = activeResource.title || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed', error);
    }
  }, [activeResource]);

  const handleFileOpen = useCallback(async () => {
    if (!activeResource || activeResource.type !== 'file') return;
    try {
      const res = await api.get(`/resources/${activeResource.id}/raw`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: activeResource.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Open failed', error);
    }
  }, [activeResource]);

  const triggerExport = () => {
    setAuthModal('export');
    setAuthPassword('');
    setAuthError('');
  };

  const handleImportFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setImportFile(event.target.files[0]);
      setAuthModal('import');
      setAuthPassword('');
      setAuthError('');
    }
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const executeExport = async () => {
    setAuthSubmitting(true);
    setAuthError('');
    try {
      const response = await api.get('/export', { params: { password: authPassword }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'encrypted-export.bin');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setAuthModal(null);
    } catch (error: any) {
      setAuthError(error.response?.status === 401 ? 'Invalid master password' : 'Export failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const executeImport = async () => {
    if (!importFile) return;
    setAuthSubmitting(true);
    setAuthError('');
    const formData = new FormData();
    formData.append('file', importFile);
    formData.append('password', authPassword);
    try {
      await api.post('/import', formData);
      setAuthModal(null);
      setImportSuccessOpen(true);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error: any) {
      setAuthError(error.response?.data?.message || 'Decryption failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('vaultor_auth_token');
    window.location.href = '/auth';
  };

  const filteredResources = useMemo(() => {
    return resources.filter((resource) => {
      const matchesType = filters.typeFilter === 'all' || resource.type === filters.typeFilter;
      const matchesTags = filters.selectedTags.length === 0 || filters.selectedTags.every((tagName) => resource.tags?.some((tag) => tag.name.toLowerCase() === tagName.toLowerCase()));
      return matchesType && matchesTags;
    });
  }, [filters.selectedTags, filters.typeFilter, resources]);

  const filteredTags = tags.filter((tag) => tag.name.toLowerCase().includes(tagSearch.toLowerCase()));
  const openWorkspaceNotes = useMemo(() => openNotes.map((note) => {
    const resource = resourceDetails[note.id] ?? null;
    const metadata = resources.find((entry) => entry.id === note.id) ?? null;

    return {
      ...note,
      resource,
      title: resource?.title ?? metadata?.title ?? 'Loading note...',
    };
  }), [openNotes, resourceDetails, resources]);

  const commandPaletteContext = useMemo<CommandContext>(() => ({
    resources,
    activeNote: workspaceResource?.type === 'note' ? workspaceResource : null,
    previewResource,
    openNotes: openWorkspaceNotes
      .map((note) => note.resource)
      .filter((note): note is Resource => Boolean(note)),
    sidebarCollapsed: sidebarCollapsedForContext,
    openResource: (resourceId: string) => openResourceById(resourceId),
    createNote: handleCreateNote,
    uploadFile: requestFileUpload,
    toggleSidebar,
    openShortcuts: openShortcutsModal,
    openSettings: openSettingsModal,
    closeActiveNote,
    closePreview: () => dismissPreview(),
    openDeleteFlow: (resourceId: string) => {
      void handleDeleteResource(resourceId);
    },
    renameResource,
  }), [
    closeActiveNote,
    dismissPreview,
    handleCreateNote,
    openResourceById,
    openSettingsModal,
    openShortcutsModal,
    openWorkspaceNotes,
    previewResource,
    renameResource,
    requestFileUpload,
    resources,
    sidebarCollapsedForContext,
    toggleSidebar,
    workspaceResource,
  ]);

  const typeLabels: Record<TypeFilter, string> = { all: 'All', note: 'Notes', file: 'Files' };
  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-3 py-3">
        <div className="relative">
          <button
            onClick={() => setShowTypeDropdown((prev) => !prev)}
            className="flex w-full items-center justify-between gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span>Type: {typeLabels[filters.typeFilter]}</span>
            <ChevronDown size={12} />
          </button>
          {showTypeDropdown && (
            <div className="absolute right-0 z-20 mt-1 w-full rounded-lg border border-border bg-card py-1 shadow-xl">
              {(['all', 'note', 'file'] as TypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    dispatch(setTypeFilter(type));
                    setShowTypeDropdown(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${filters.typeFilter === type ? 'font-semibold text-primary' : ''}`}
                >
                  {typeLabels[type]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 px-3 pb-2">
        <button
          onClick={handleCreateNote}
          disabled={createNotePending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-medium text-white transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createNotePending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New Note
        </button>
        <button
          onClick={requestFileUpload}
          disabled={uploadPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium transition-all hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800"
        >
          {uploadPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Upload
        </button>
      </div>

      {filters.selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
          {filters.selectedTags.map((tagName) => (
            <span key={tagName} className="flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {tagName}
              <button onClick={() => dispatch(removeSelectedTag(tagName))} className="ml-1 opacity-60 hover:opacity-100"><X size={10} /></button>
            </span>
          ))}
          <button onClick={() => dispatch(clearSelectedTags())} className="ml-1 text-[10px] text-slate-400 hover:text-red-500">Clear</button>
        </div>
      )}

      <div className="border-t border-border" />

      <div className="px-4 py-1.5 text-[10px] font-medium text-slate-400">
        {filteredResources.length} resource{filteredResources.length === 1 ? '' : 's'}
      </div>

      <div className="flex-1 overflow-y-auto py-0.5">
        {sidebarLoading ? (
          <div className="space-y-2 px-3 py-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded-xl bg-background" />
            ))}
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No resources found</div>
        ) : (
          <>
            {filteredResources.filter((resource) => resource.type === 'note').length > 0 && filters.typeFilter !== 'file' && (
              <>
                <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400/70">Notes</div>
                {filteredResources.filter((resource) => resource.type === 'note').map((resource) => (
                  <SidebarItem
                    key={resource.id}
                    resource={resource}
                    isActive={currentResourceId === resource.id}
                    onClick={() => openResourceById(resource.id)}
                    onDelete={(event) => handleDeleteResource(resource.id, event)}
                  />
                ))}
              </>
            )}
            {filteredResources.filter((resource) => resource.type === 'file').length > 0 && filters.typeFilter !== 'note' && (
              <>
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400/70">Files</div>
                {filteredResources.filter((resource) => resource.type === 'file').map((resource) => (
                  <SidebarItem
                    key={resource.id}
                    resource={resource}
                    isActive={currentResourceId === resource.id}
                    onClick={() => openResourceById(resource.id)}
                    onDelete={(event) => handleDeleteResource(resource.id, event)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="border-t border-border" />

      <div className="flex max-h-40 flex-col px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tags</span>
        </div>
        {tags.length > 3 && (
          <input
            type="text"
            placeholder="Search tags..."
            className="mb-1.5 w-full rounded border border-border bg-background px-2.5 py-1 text-[11px] focus:border-primary focus:outline-none"
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
          />
        )}
        <div className="flex flex-wrap gap-1 overflow-y-auto">
          {filteredTags.map((tag) => (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                filters.selectedTags.includes(tag.name)
                  ? 'border-primary/30 bg-primary/15 text-primary'
                  : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <button onClick={() => dispatch(toggleSelectedTag(tag.name))} className="cursor-pointer">{tag.name}</button>
              <button
                onClick={() => setTagDeleteModal({ id: tag.id, name: tag.name })}
                className="opacity-40 transition-opacity hover:text-red-500 hover:opacity-100"
                title="Delete tag"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {filteredTags.length === 0 && <span className="text-[10px] text-slate-400">No tags</span>}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-background p-2">
        <div className="flex items-center gap-0.5">
          <button onClick={triggerExport} title="Export Vault" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-card hover:text-primary"><DownloadCloud size={16} /></button>
          <button onClick={() => importInputRef.current?.click()} title="Import Vault" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-card hover:text-primary"><UploadCloud size={16} /></button>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={openShortcutsModal} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-card hover:text-primary" title="Shortcuts">
            <Command size={16} />
          </button>
          <button onClick={openSettingsModal} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-card hover:text-primary" title="Settings">
            <Settings2 size={16} />
          </button>
          <button onClick={toggleTheme} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-card hover:text-primary">
            {localSettings.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button onClick={logout} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-card hover:text-red-500" title="Lock Vault"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`app-root flex h-screen flex-col overflow-hidden bg-background text-foreground ${commandPaletteOpen ? 'command-open pointer-events-none' : ''}`}>
      <input type="file" ref={mdUploadRef} className="hidden" accept=".md,.markdown,.txt" onChange={handleMdFileChange} />
      <input type="file" ref={csvUploadRef} className="hidden" accept=".csv,.tsv,.txt" onChange={handleCsvFileChange} />
      <input type="file" ref={fileUploadRef} className="hidden" onChange={handleUploadFile} />
      <input type="file" ref={importInputRef} onChange={handleImportFileSelect} className="hidden" accept=".bin,.zip" />

      <CommandPaletteModal
        open={commandPaletteOpen}
        onClose={closeCommandPalette}
        context={commandPaletteContext}
        onHighlightPreviewResource={highlightCommandPalettePreviewResource}
        previewVisible={Boolean(previewResourceId)}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={closeShortcutsModal} />
      <SettingsModal open={settingsOpen} onClose={closeSettingsModal} />

      <AppModal
        open={tagInputOpen}
        onClose={() => {
          if (!tagAddPending) {
            setTagInputOpen(false);
            setTagInputValue('');
          }
        }}
        title="Add Tag"
        description="Add a tag to the current resource."
        footer={
          <>
            <button
              onClick={() => {
                setTagInputOpen(false);
                setTagInputValue('');
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-background"
              disabled={tagAddPending}
            >
              Cancel
            </button>
            <button
              onClick={() => handleAddTag(tagInputValue)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={tagAddPending || !tagInputValue.trim()}
            >
              {tagAddPending ? 'Adding...' : 'Add Tag'}
            </button>
          </>
        }
      >
        <input
          autoFocus
          value={tagInputValue}
          onChange={(event) => setTagInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleAddTag(tagInputValue);
            }
          }}
          placeholder="Tag name"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </AppModal>

      <AppModal
        open={Boolean(authModal)}
        onClose={() => {
          if (!authSubmitting) setAuthModal(null);
        }}
        title={authModal === 'export' ? 'Secure Export' : 'Secure Import'}
        description={authModal === 'export'
          ? 'Enter your master password to encrypt and download your vault.'
          : 'Import will overwrite all existing local data with the selected backup.'}
        footer={
          <>
            <button
              onClick={() => setAuthModal(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-background"
              disabled={authSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={authModal === 'export' ? executeExport : executeImport}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={authSubmitting || !authPassword || (authModal === 'import' && !importFile)}
            >
              {authSubmitting ? 'Working...' : authModal === 'export' ? 'Encrypt & Download' : 'Decrypt & Restore'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {authModal === 'import' && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              {importFile ? `Selected backup: ${importFile.name}` : 'Choose a backup file from the footer import button first.'}
            </div>
          )}
          {authError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {authError}
            </div>
          )}
          <input
            type="password"
            autoFocus
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (authModal === 'export') executeExport();
                if (authModal === 'import') executeImport();
              }
            }}
            placeholder="Master Password"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
      </AppModal>

      <AppModal
        open={importSuccessOpen}
        onClose={() => setImportSuccessOpen(false)}
        title="Vault Restored"
        description="Your backup was imported successfully. Vaultor is refreshing now."
        footer={
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Refresh Now
          </button>
        }
      >
        <p className="text-sm text-slate-500">A short restart keeps the restored vault consistent before you continue working.</p>
      </AppModal>

      <AppModal
        open={Boolean(deleteModal)}
        onClose={() => {
          if (!deletePending) setDeleteModal(null);
        }}
        title={deleteModal?.backlinks.length ? 'Referenced Resource' : 'Delete Resource'}
        description={deleteModal?.backlinks.length
          ? `This resource is referenced by ${deleteModal.backlinks.length} resource${deleteModal.backlinks.length === 1 ? '' : 's'}.`
          : 'This resource will be deleted permanently.'}
        footer={
          <>
            <button
              onClick={() => setDeleteModal(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-background"
              disabled={deletePending}
            >
              Cancel
            </button>
            {Boolean(deleteModal?.backlinks.length) && (
              <button
                onClick={() => deleteModal && setReplaceLinkModal({ oldId: deleteModal.id, title: deleteModal.title, backlinks: deleteModal.backlinks })}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                disabled={deletePending}
              >
                Replace Links
              </button>
            )}
            <button
              onClick={() => deleteModal && executeDelete(deleteModal.id)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={deletePending}
            >
              {deletePending ? 'Deleting...' : 'Delete Anyway'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">{deleteModal?.title}</div>
              <div className="mt-1 text-xs opacity-80">Delete is permanent, so Vaultor pauses here before removing the resource.</div>
            </div>
          </div>
          {Boolean(deleteModal?.backlinks.length) && (
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {deleteModal?.backlinks.map((resource) => (
                <div key={resource.id} className="flex items-center gap-3 rounded-xl bg-background px-3 py-2 text-sm">
                  {resource.type === 'note' ? <FileText size={14} className="text-blue-500" /> : <Paperclip size={14} className="text-green-500" />}
                  <span className="truncate">{resource.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </AppModal>

      <AppModal
        open={Boolean(replaceLinkModal)}
        onClose={() => {
          if (!replacePending) setReplaceLinkModal(null);
        }}
        title="Replace Links"
        description="Choose a resource to receive all incoming links before the original is deleted."
        footer={
          <button
            onClick={() => setReplaceLinkModal(null)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-background"
            disabled={replacePending}
          >
            Cancel
          </button>
        }
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              autoFocus
              value={replaceSearch}
              onChange={(event) => setReplaceSearch(event.target.value)}
              placeholder="Search replacement resource..."
              className="w-full rounded-xl border border-border bg-background py-3 pl-9 pr-4 text-sm outline-none transition-colors focus:border-primary"
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {replaceResults.map((resource) => (
              <button
                key={resource.id}
                onClick={() => executeReplaceLinks(resource.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                disabled={replacePending}
              >
                {resource.type === 'note' ? <FileText size={14} className="text-blue-500" /> : <Paperclip size={14} className="text-green-500" />}
                <span className="truncate text-sm font-medium">{resource.title}</span>
              </button>
            ))}
            {!replaceLoading && replaceSearch.trim() && replaceResults.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-slate-500">No matches found.</div>
            )}
            {replaceLoading && <div className="px-1 text-sm text-slate-400">Searching replacements...</div>}
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(tagDeleteModal)}
        onClose={() => {
          if (!tagDeletePending) setTagDeleteModal(null);
        }}
        title="Delete Tag"
        description="Delete this tag from all resources in Vaultor?"
        footer={
          <>
            <button
              onClick={() => setTagDeleteModal(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-background"
              disabled={tagDeletePending}
            >
              Cancel
            </button>
            <button
              onClick={executeDeleteTag}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              disabled={tagDeletePending}
            >
              {tagDeletePending ? 'Deleting...' : 'Delete Tag'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-500">
          {tagDeleteModal?.name ? `"${tagDeleteModal.name}" will be removed everywhere it appears.` : ''}
        </p>
      </AppModal>

      <div className="relative flex min-h-0 flex-1">
        {!isFloatingSidebarMode && (
          <aside
            className={`border-r border-border bg-card transition-all duration-200 ${fixedSidebarHidden ? 'w-0 border-r-0 opacity-0' : 'w-72 opacity-100'}`}
          >
            <div className={`h-full ${fixedSidebarHidden ? 'pointer-events-none' : ''}`}>
              {sidebarContent}
            </div>
          </aside>
        )}

        {isFloatingSidebarMode && !workspaceSettings.focusMode && (
          <>
            <div
              className="absolute inset-y-0 left-0 z-20 w-1.5"
              onMouseEnter={showFloatingSidebar}
            />
            <div className="pointer-events-none absolute inset-y-0 left-0 z-30 flex items-start pl-2 pt-2 pb-2">
              <div
                className={`pointer-events-auto h-full w-72 overflow-hidden rounded-2xl border border-white/8 bg-card/90 shadow-xl backdrop-blur-md transition-transform duration-200 ease-out ${
                  floatingSidebarVisible ? 'translate-x-0' : '-translate-x-[calc(100%+0.75rem)]'
                }`}
                onMouseEnter={showFloatingSidebar}
                onMouseLeave={scheduleFloatingSidebarHide}
              >
                {sidebarContent}
              </div>
            </div>
          </>
        )}

        <main className="min-w-0 flex-1">
          {openWorkspaceNotes.length > 0 ? (
            <div className={getWorkspaceLayoutClass(openWorkspaceNotes.length)}>
              {openWorkspaceNotes.map((note, index) => (
                <div
                  key={note.id}
                  className={getWorkspacePaneClass({
                    noteCount: openWorkspaceNotes.length,
                    isActive: note.id === activeNoteId,
                    index,
                  })}
                >
                  <div className="border-b border-border/60 px-1 pb-3 pt-4">
                    {titleEditState?.noteId === note.id ? (
                      <input
                        ref={titleInputRef}
                        value={titleEditState.value}
                        onChange={(event) => setTitleEditState((current) => (
                          current && current.noteId === note.id
                            ? { ...current, value: event.target.value }
                            : current
                        ))}
                        onKeyDown={async (event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            await commitTitleEditing();
                          }

                          if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelTitleEditing();
                          }
                        }}
                        onBlur={() => {
                          if (titleEditDismissRef.current) {
                            titleEditDismissRef.current = null;
                            return;
                          }
                          void commitTitleEditing();
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-lg font-semibold text-foreground outline-none transition-colors focus:border-primary"
                        placeholder="Untitled Note"
                      />
                    ) : (
                      <button
                        onClick={() => startTitleEditing(note.id, note.title)}
                        className={`w-full rounded-lg px-2 py-1 text-left text-lg font-semibold transition-colors ${
                          note.id === activeNoteId
                            ? 'text-foreground hover:bg-background/80'
                            : 'text-slate-500 hover:bg-background/60 hover:text-foreground'
                        }`}
                      >
                        {note.title}
                      </button>
                    )}

                    {note.id === activeNoteId && note.resource?.type === 'note' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(note.resource.tags ?? []).slice(0, 4).map((tag) => (
                          <span key={tag.id} className="flex items-center rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                            {tag.name}
                            <button onClick={() => handleRemoveTag(tag.name)} className="ml-1.5 opacity-60 hover:opacity-100"><X size={10} /></button>
                          </span>
                        ))}
                        <button
                          onClick={() => setTagInputOpen(true)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-primary hover:text-primary"
                        >
                          <TagIcon size={13} /> Add Tag
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={openWorkspaceNotes.length === 1 ? 'min-h-0 flex-1 overflow-y-auto px-1' : 'min-h-0 flex-1 overflow-y-auto'}>
                    {note.resource?.type === 'note' ? (
                      <BlockEditor
                        noteId={note.id}
                        content={parseNoteContent(note.resource.content)}
                        autosaveDelay={workspaceSettings.autosaveDelay}
                        isActive={note.id === activeNoteId}
                        interactionLocked={commandPaletteOpen}
                        shouldRestoreFocus={focusRestoreNoteId === note.id}
                        savedSelection={note.selection ?? null}
                        onActivate={(noteId) => activateOpenNote(noteId)}
                        onFocusRestored={handleNoteFocusRestored}
                        onSelectionChange={(selection) => saveNoteSelection(note.id, selection)}
                        onUpdate={(json) => handleContentUpdate(note.id, json)}
                        onRequestMdUpload={handleRequestMdUpload}
                        onRequestCsvUpload={handleRequestCsvUpload}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        Loading note...
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {backlinks.length > 0 && activeNoteId && openWorkspaceNotes.length > 1 && !workspaceSettings.focusMode && (
                <div className="hidden w-72 flex-shrink-0 overflow-y-auto border-l border-border/60 pl-4 xl:block">
                  <h4 className="mb-3 flex items-center text-sm font-semibold text-slate-400"><Search size={14} className="mr-2" /> Linked from</h4>
                  <div className="space-y-2">
                    {backlinks.map((resource) => (
                      <div
                        key={resource.id}
                        onClick={() => openResourceById(resource.id)}
                        className="flex cursor-pointer items-center rounded-xl bg-background/70 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        {resource.type === 'note' ? <FileText size={16} className="mr-3 opacity-80 text-blue-500" /> : <Paperclip size={16} className="mr-3 opacity-80 text-green-500" />}
                        <span className="truncate text-sm font-medium">{resource.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeResourceLoading ? (
            <div className="flex-1 p-8">
              <div className="mx-auto max-w-4xl space-y-4">
                <div className="h-24 animate-pulse rounded-2xl bg-card" />
                <div className="h-24 animate-pulse rounded-2xl bg-card" />
                <div className="h-24 animate-pulse rounded-2xl bg-card" />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 pt-6 text-slate-400">
              <Database size={64} className="mb-6 opacity-20" />
              <h2 className="mb-2 text-2xl font-semibold text-slate-500">Welcome to Vaultor</h2>
              <p className="mb-6 text-sm opacity-80">Open the command palette with {isMac ? 'Cmd+K' : 'Ctrl+K'} to jump anywhere fast.</p>
              <div className="flex gap-3">
                <button onClick={handleCreateNote} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"><Plus size={16} /> New Note</button>
                <button onClick={requestFileUpload} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card"><Upload size={16} /> Upload File</button>
              </div>
            </div>
          )}
        </main>
      </div>

      {previewResource && previewResourceType && (
        <PreviewLayer
          resource={previewResource}
          mode={effectivePreviewMode}
          overrideActive={previewOverrideMode !== null}
          open={Boolean(previewResourceId)}
          onClose={() => dismissPreview()}
          onToggleMode={togglePreviewMode}
          onOpenExternal={handleFileOpen}
          onDownload={handleFileDownload}
        />
      )}
      {previewResourceLoading && (
        effectivePreviewMode === 'modal' ? (
          <div className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="flex h-[80vh] w-full max-w-6xl items-center justify-center rounded-[1.75rem] border border-border bg-card shadow-2xl">
              <div className="text-sm text-slate-400">Loading preview...</div>
            </div>
          </div>
        ) : (
          <div className="pointer-events-none fixed inset-y-0 right-0 z-[74] flex w-full justify-end">
            <div className="pointer-events-auto flex h-full w-full max-w-[min(40%,44rem)] items-center justify-center border-l border-border bg-card shadow-2xl">
              <div className="text-sm text-slate-400">Loading preview...</div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function parseNoteContent(content: Resource['content']) {
  if (!content) {
    return null;
  }

  if (typeof content !== 'string') {
    return content;
  }

  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function upsertOpenNote(
  notes: OpenNote[],
  noteId: string,
  maxOpenNotes: number,
  openBehavior: 'replace' | 'split',
) {
  const existing = notes.find((note) => note.id === noteId);
  if (openBehavior === 'replace') {
    return existing ? [existing] : [{ id: noteId }];
  }

  if (existing) {
    return notes;
  }

  return limitOpenNotes([...notes, { id: noteId }], maxOpenNotes);
}

function limitOpenNotes(notes: OpenNote[], maxOpenNotes: number) {
  if (notes.length <= maxOpenNotes) {
    return notes;
  }

  return notes.slice(notes.length - maxOpenNotes);
}

function getWorkspaceLayoutClass(noteCount: number) {
  if (noteCount <= 1) {
    return 'flex h-full w-full justify-center overflow-hidden px-6 py-3';
  }

  return noteCount === 2
    ? 'flex h-full min-w-0 gap-6 overflow-hidden px-4 py-3'
    : 'flex h-full min-w-0 gap-4 overflow-hidden px-4 py-3';
}

function getWorkspacePaneClass({
  noteCount,
  isActive,
  index,
}: {
  noteCount: number;
  isActive: boolean;
  index: number;
}) {
  const spacingClass = noteCount > 1 && index > 0 ? 'border-l border-border/60' : '';
  const visualClass = isActive
    ? 'bg-background opacity-100'
    : 'bg-background/40 opacity-[0.88] scale-[0.992]';
  const motionClass = 'transform-gpu transition-[opacity,transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]';

  if (noteCount <= 1) {
    return `flex min-w-0 w-full max-w-4xl flex-col overflow-hidden ${visualClass}`;
  }

  if (noteCount === 2) {
    return `flex min-w-0 flex-1 flex-col overflow-hidden ${motionClass} ${visualClass} ${spacingClass}`;
  }

  const widthClass = isActive ? 'flex-[1.2]' : 'flex-[0.9]';
  return `flex min-w-0 ${widthClass} flex-col overflow-hidden ${motionClass} ${visualClass} ${spacingClass}`;
}

function SidebarItem({ resource, isActive, onClick, onDelete }: { resource: Resource; isActive: boolean; onClick: () => void; onDelete: (event: React.MouseEvent) => void }) {
  return (
    <div
      onClick={onClick}
      className={`group mx-2 mb-0.5 flex cursor-pointer items-center justify-between rounded-lg border-l-2 px-3 py-1.5 transition-all ${
        isActive ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <div className="flex min-w-0 items-center overflow-hidden pr-2">
        {resource.type === 'note'
          ? <FileText size={14} className={`mr-2 flex-shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
          : <Paperclip size={14} className={`mr-2 flex-shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />}
        <span className={`truncate text-[13px] ${isActive ? 'font-medium text-primary' : ''}`}>{resource.title}</span>
      </div>
      <button onClick={onDelete} className="flex-shrink-0 p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
    </div>
  );
}
