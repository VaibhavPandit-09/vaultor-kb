import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  findNodeHandle,
  Pressable,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { usePalette, useReading } from './ui';
import { motionDuration, settleEasing } from './motion';
import { usableOrigin, type Rect } from './resourceGeometry';

type Measurement = { rect: Rect; text: Rect };
type Origin = {
  id: string;
  scope: string;
  title: string;
  measure(): Promise<Measurement | undefined>;
  focus(): void;
};
const Context = createContext<{ scope: string; begin(origin: Origin): void }>({
  scope: '',
  begin() {},
});
export const ResourceMotionProvider = Context.Provider;

/** Real native row/title measurements; dispatch is never held behind measurement. */
export function ResourceTouch({
  resourceId,
  title,
  children,
  onPress,
  ...props
}: Omit<PressableProps, 'children'> & {
  resourceId?: string;
  title: string;
  children(
    titleRef: React.RefObject<React.ElementRef<typeof Text> | null>,
  ): React.ReactNode;
}) {
  const context = useContext(Context),
    row = useRef<React.ElementRef<typeof View>>(null),
    text = useRef<React.ElementRef<typeof Text>>(null);
  const identity = `${context.scope}:${resourceId}`,
    current = useRef(identity);
  current.current = identity;
  return (
    <Pressable
      {...props}
      ref={row}
      collapsable={false}
      onPress={event => {
        if (resourceId)
          context.begin({
            id: resourceId,
            title,
            scope: context.scope,
            measure: () =>
              new Promise(resolve => {
                let finished = false;
                const timer = setTimeout(() => {
                  finished = true;
                  resolve(undefined);
                }, 150);
                const done = (value?: Measurement) => {
                  if (!finished) {
                    finished = true;
                    clearTimeout(timer);
                    resolve(current.current === identity ? value : undefined);
                  }
                };
                if (!row.current || !text.current) {
                  done();
                  return;
                }
                row.current.measureInWindow((x, y, width, height) => {
                  text.current?.measureInWindow((tx, ty, tw, th) =>
                    done({
                      rect: { x, y, width, height },
                      text: { x: tx, y: ty, width: tw, height: th },
                    }),
                  );
                });
              }),
            focus: () => {
              const tag = findNodeHandle(row.current);
              if (tag && current.current === identity)
                AccessibilityInfo.setAccessibilityFocus(tag);
            },
          });
        onPress?.(event);
      }}
    >
      {children(text)}
    </Pressable>
  );
}

type Presentation = {
  origin: Origin;
  from: Measurement;
  viewport: Rect;
  closing: boolean;
  shared: boolean;
};
const zero = { x: 0, y: 0, width: 0, height: 0 };
export function useResourceMotion(
  scope: string,
  reading: boolean,
  noteId: string | undefined,
  busy: boolean,
  rail: boolean,
) {
  const { reduced, preferences } = useReading();
  const viewportRef = useRef<React.ElementRef<typeof View>>(null),
    viewport = useRef<Rect>(zero);
  const progress = useRef(new Animated.Value(1)).current,
    ticket = useRef(0);
  const latest = useRef({ scope, reading, noteId, busy });
  latest.current = { scope, reading, noteId, busy };
  const [presentation, setPresentation] = useState<Presentation>(),
    [moving, setMoving] = useState(false);
  const active = useRef<Presentation | undefined>(undefined);
  active.current = presentation;
  const animate = (toValue: number, token: number, done?: () => void) => {
    setMoving(true);
    Animated.timing(progress, {
      toValue,
      duration: motionDuration('navigation', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && token === ticket.current) {
        setMoving(false);
        done?.();
      }
    });
  };
  const reset = useCallback(() => {
    ticket.current++;
    progress.stopAnimation();
    progress.setValue(1);
    setMoving(false);
    setPresentation(undefined);
  }, [progress]);
  const measureViewport = () =>
    viewportRef.current?.measureInWindow((x, y, width, height) => {
      const old = viewport.current;
      if (
        old.width &&
        (Math.abs(old.width - width) > 32 || Math.abs(old.height - height) > 24)
      )
        reset();
      else if (
        (old.height !== height ||
          old.width !== width ||
          old.x !== x ||
          old.y !== y) &&
        active.current
      ) {
        // The existing browsing folio contracts by a few dp during this reveal.
        // Follow that real viewport allocation instead of cancelling our origin.
        setPresentation(value =>
          value ? { ...value, viewport: { x, y, width, height } } : value,
        );
      }
      viewport.current = { x, y, width, height };
    });
  const begin = (origin: Origin) => {
    const token = ++ticket.current;
    progress.stopAnimation();
    opened.current = false;
    void origin.measure().then(value => {
      if (token !== ticket.current || origin.scope !== latest.current.scope)
        return;
      const area = viewport.current;
      if (!area.width) return;
      const from =
        value && usableOrigin(value.rect, area)
          ? value
          : {
              rect: {
                ...area,
                y: area.y + 20,
                height: Math.max(1, area.height - 20),
              },
              text: { ...area, x: area.x + 20, y: area.y + 20, height: 24 },
            };
      setPresentation({
        origin,
        from,
        viewport: area,
        closing: false,
        shared: !!value && usableOrigin(value.rect, area),
      });
      progress.setValue(0);
      animate(1, token);
    });
  };
  const opened = useRef(false);
  const wasReading = useRef(reading);
  useEffect(() => {
    const previous = wasReading.current;
    wasReading.current = reading;
    if (reading) {
      opened.current = true;
      if (presentation && presentation.origin.id !== noteId) reset();
    } else if (previous && !active.current && viewport.current.width) {
      const area = viewport.current,
        token = ++ticket.current;
      const origin: Origin = {
        id: noteId || '',
        scope,
        title: '',
        measure: () => Promise.resolve(undefined),
        focus() {},
      };
      setPresentation({
        origin,
        viewport: area,
        from: {
          rect: { ...area, y: area.y + 16, height: area.height - 16 },
          text: area,
        },
        closing: true,
        shared: false,
      });
      progress.setValue(1);
      animate(0, token, () => setPresentation(undefined));
    } else if (previous && active.current) {
      const retained = active.current,
        token = ++ticket.current;
      progress.stopAnimation();
      void retained.origin.measure().then(value => {
        if (token !== ticket.current) return;
        const valid =
          value &&
          retained.origin.scope === scope &&
          retained.origin.id === noteId &&
          usableOrigin(value.rect, viewport.current);
        const area = viewport.current;
        setPresentation({
          ...retained,
          from: valid
            ? value!
            : {
                rect: { ...area, y: area.y + 16, height: area.height - 16 },
                text: retained.from.text,
              },
          closing: true,
          shared: !!valid,
        });
        animate(0, token, () => {
          setPresentation(undefined);
          if (valid) retained.origin.focus();
        });
      });
    }
    // Navigation, not animation completion, owns reader state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, noteId]);
  useEffect(() => {
    if (
      presentation &&
      !busy &&
      !reading &&
      !opened.current &&
      !presentation.closing
    )
      reset();
  }, [busy, reading, presentation, reset]); // failed opening
  useEffect(() => {
    reset(); /* source identity invalidates all origins */
  }, [scope, reset]);
  useEffect(() => {
    const lifetime = ticket;
    const sub = AppState.addEventListener('change', v => {
      if (v !== 'active') reset();
    });
    return () => {
      sub.remove();
      lifetime.current++;
      progress.stopAnimation();
    };
  }, [progress, reset]);
  const area = presentation?.viewport ?? viewport.current;
  const titleTarget: Rect = {
    x: area.x + (rail ? -120 : 56),
    y: area.y + (rail ? 52 : area.height + 6),
    width: rail ? 112 : Math.max(24, area.width - 208),
    height: 24,
  };
  return {
    viewportRef,
    measureViewport,
    context: { scope, begin },
    presentation,
    progress,
    titleTarget,
    moving,
    titleMoving: moving && !!presentation?.shared,
    reset,
    pending: !!presentation && !presentation.closing && !reading && busy,
    visible: reading || !!presentation,
  };
}

/** A moving aperture reveals final-size document pixels. No WebView/text scaling. */
export function ReaderAperture({
  motion,
  reading,
  children,
}: {
  motion: ReturnType<typeof useResourceMotion>;
  reading: boolean;
  children: React.ReactNode;
}) {
  const p = usePalette(),
    m = motion.presentation;
  const area = m?.viewport ?? zero;
  const from = m?.from.rect ?? area;
  const blend = (a: number, b: number) =>
    motion.progress.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  const left = blend(from.x - area.x, 0),
    top = blend(from.y - area.y, 0);
  return (
    <>
      <Animated.View
        testID="reader-aperture"
        pointerEvents={reading ? 'auto' : 'none'}
        importantForAccessibility={reading ? 'auto' : 'no-hide-descendants'}
        style={
          m
            ? {
                position: 'absolute',
                left,
                top,
                width: blend(from.width, area.width),
                height: blend(from.height, area.height),
                overflow: 'hidden',
                backgroundColor: p.canvas,
                borderRadius: blend(8, 0),
              }
            : {
                position: 'absolute',
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                overflow: 'hidden',
                backgroundColor: p.canvas,
              }
        }
      >
        <Animated.View
          style={
            m
              ? {
                  position: 'absolute',
                  left: Animated.multiply(left, -1),
                  top: Animated.multiply(top, -1),
                  width: area.width,
                  height: area.height,
                }
              : { flex: 1 }
          }
        >
          {children}
        </Animated.View>
      </Animated.View>
      {m && m.shared && motion.moving ? (
        <Animated.Text
          pointerEvents="none"
          importantForAccessibility="no"
          numberOfLines={1}
          style={{
            position: 'absolute',
            color: p.text,
            fontWeight: '600',
            fontSize: 16,
            left: blend(m.from.text.x - area.x, motion.titleTarget.x - area.x),
            top: blend(m.from.text.y - area.y, motion.titleTarget.y - area.y),
            width: blend(
              m.from.text.width,
              motion.titleTarget.width || m.from.text.width,
            ),
          }}
        >
          {m.origin.title}
        </Animated.Text>
      ) : null}
    </>
  );
}
