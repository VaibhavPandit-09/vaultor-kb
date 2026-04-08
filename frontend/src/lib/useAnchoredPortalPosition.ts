import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

type AnchoredPortalOptions = {
  width?: number | 'anchor';
  minWidth?: number;
  align?: 'start' | 'end';
  offset?: number;
  viewportPadding?: number;
  preferredPlacement?: 'bottom' | 'top';
};

type AnchoredPortalPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
};

const DEFAULT_MENU_HEIGHT = 240;

export function useAnchoredPortalPosition<T extends HTMLElement>(
  open: boolean,
  anchorRef: RefObject<T | null>,
  options: AnchoredPortalOptions = {},
) {
  const [position, setPosition] = useState<AnchoredPortalPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      setPosition(null);
      return;
    }

    const {
      width = 'anchor',
      minWidth = 0,
      align = 'start',
      offset = 8,
      viewportPadding = 12,
      preferredPlacement = 'bottom',
    } = options;

    const rect = anchor.getBoundingClientRect();
    const resolvedWidth = Math.max(minWidth, width === 'anchor' ? rect.width : width);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const placeAbove = preferredPlacement === 'top'
      ? true
      : spaceBelow < DEFAULT_MENU_HEIGHT && spaceAbove > spaceBelow;

    let left = align === 'end' ? rect.right - resolvedWidth : rect.left;
    left = Math.min(viewportWidth - viewportPadding - resolvedWidth, Math.max(viewportPadding, left));

    if (placeAbove) {
      setPosition({
        top: rect.top - offset,
        left,
        width: resolvedWidth,
        maxHeight: Math.max(120, spaceAbove - offset),
        placement: 'top',
      });
      return;
    }

    setPosition({
      top: rect.bottom + offset,
      left,
      width: resolvedWidth,
      maxHeight: Math.max(120, spaceBelow - offset),
      placement: 'bottom',
    });
  }, [anchorRef, options]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- menu placement must sync to measured DOM geometry after mount.
    updatePosition();

    const handleViewportChange = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updatePosition]);

  return { position: open ? position : null };
}
