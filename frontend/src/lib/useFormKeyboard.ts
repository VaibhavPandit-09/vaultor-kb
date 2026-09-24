import { useRef, type FormEvent, type KeyboardEvent } from 'react';

/** Native form submission, without treating IME confirmation as an action. */
export function useFormKeyboard(submit: () => void | Promise<void>) {
  const composing = useRef(false);
  return {
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: () => { composing.current = false; },
    onKeyDownCapture: (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
    },
    onSubmit: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!composing.current) void submit();
    },
  };
}
