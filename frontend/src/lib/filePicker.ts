let active = false;
const held = new Set<string>();
window.addEventListener('keydown', event => { if (!event.isComposing) held.add(event.key); }, true);
window.addEventListener('keyup', event => { held.delete(event.key); }, true);
window.addEventListener('blur', () => held.clear());

/** All upload entry points use a connected, short-lived native input. */
export function pickFiles(accept = '', multiple = false): Promise<File[]> {
  if (active) return Promise.reject(new Error('A file picker is already open.'));
  active = true;
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = multiple;
    input.style.cssText = 'position:fixed;left:-10000px;width:1px;height:1px;';
    document.body.append(input);
    const finish = (files: File[]) => { active = false; input.remove(); resolve(files); };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => finish([]), { once: true });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const open = () => { try {
      // click is invoked in the original click/keyup user activation, never a timer.
      input.click();
    } catch (error) { active = false; input.remove(); reject(error); } };
    // Keyboard commands run on keydown; wait for key release before transferring
    // focus to a native dialog. Mouse activation uses the identical opening path.
    const activationKey = ['Enter', ' '].find(key => held.has(key));
    if (activationKey) {
      const cancel = () => { window.removeEventListener('keyup', released, true); finish([]); };
      const released = (event: KeyboardEvent) => {
        if (event.key !== activationKey) return;
        window.removeEventListener('keyup', released, true); window.removeEventListener('blur', cancel);
        event.preventDefault(); open();
      };
      window.addEventListener('keyup', released, true); window.addEventListener('blur', cancel, { once: true });
    } else open();
  });
}
