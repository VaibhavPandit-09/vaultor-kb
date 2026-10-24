/** Existing pane-layout thresholds, measured inside the workspace after navigation chrome. */
export function sideBySideCapacity(width:number):number {return width>1200?3:width>850?2:1;}
