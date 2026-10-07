export const sidebarSectionNames = ['pinned', 'recent', 'tags'] as const;
export type SidebarSectionName = typeof sidebarSectionNames[number];
export type SidebarSections = Record<SidebarSectionName, { visible: boolean; collapsed: boolean }>;
export function normalizeSidebarSections(input: unknown): SidebarSections {
  const values = input && typeof input === 'object' ? input as Partial<SidebarSections> : {};
  return Object.fromEntries(sidebarSectionNames.map(name => [name, {
    visible: values[name]?.visible !== false,
    collapsed: values[name]?.collapsed === true,
  }])) as SidebarSections;
}
