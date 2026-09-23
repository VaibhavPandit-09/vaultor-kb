import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

type AnchoredPortalOptions = {
  width?: number | 'anchor';
  minWidth?: number;
  align?: 'start' | 'end';
  offset?: number;
  viewportPadding?: number;
  preferredPlacement?: 'bottom' | 'top';
  bounds?: { top: number; left: number; right: number; bottom: number };
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
  const { width = 'anchor', minWidth = 0, align = 'start', offset = 8,
    viewportPadding = 12, preferredPlacement = 'bottom' } = options;
  const { top: boundTop = 0, left: boundLeft = 0, right: boundRight = Infinity,
    bottom: boundBottom = Infinity } = options.bounds ?? {};

  const bounded = Boolean(options.bounds);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      setPosition(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const desiredWidth = Math.max(minWidth, width === 'anchor' ? rect.width : width);
    const resolvedWidth = bounded ? Math.min(desiredWidth, Math.max(0, Math.min(window.innerWidth, boundRight) - boundLeft - viewportPadding * 2)) : desiredWidth;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = Math.min(viewportHeight, boundBottom) - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - Math.max(0, boundTop) - viewportPadding;
    const placeAbove = preferredPlacement === 'top'
      ? true
      : spaceBelow < DEFAULT_MENU_HEIGHT && spaceAbove > spaceBelow;

    let left = align === 'end' ? rect.right - resolvedWidth : rect.left;
    left = Math.min(Math.min(viewportWidth, boundRight) - viewportPadding - resolvedWidth, Math.max(boundLeft + viewportPadding, left));

    const next: AnchoredPortalPosition = {
      top: placeAbove ? rect.top - offset : rect.bottom + offset,
      left,
      width: resolvedWidth,
      maxHeight: Math.max(bounded ? 0 : 120, (placeAbove ? spaceAbove : spaceBelow) - offset),
      placement: placeAbove ? 'top' : 'bottom',
    };
    setPosition(previous => previous && Object.keys(next).every(
      key => previous[key as keyof AnchoredPortalPosition] === next[key as keyof AnchoredPortalPosition],
    ) ? previous : next);
  }, [anchorRef, width, minWidth, align, offset, viewportPadding, preferredPlacement, boundTop, boundLeft, boundRight, boundBottom, bounded]);

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

  return { position: open ? position : null, updatePosition };
}
