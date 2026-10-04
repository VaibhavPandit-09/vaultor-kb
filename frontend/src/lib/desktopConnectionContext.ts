import { createContext } from 'react';
export const DesktopConnectionContext = createContext<{ name: string; online: boolean; open: () => void } | null>(null);
