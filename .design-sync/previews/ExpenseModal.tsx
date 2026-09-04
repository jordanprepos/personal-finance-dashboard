// Owned preview — .cf-modal-scrim is `position: fixed`, and the preview card
// sets `transform: translateZ(0)` on its container. A transformed ancestor
// becomes the containing block for fixed descendants, so the scrim sizes to
// the card instead of the viewport and the modal is clipped. The reference
// storybook has no such ancestor, which is why only the preview showed it.
//
// Giving the card real height puts the scrim back in a box the modal fits in,
// so the preview matches the storybook render. Everything else is the
// generated composition, unchanged.
import * as React from 'react';
import * as S from "@ds-stories/packages/design-system/src/components/ExpenseModal.stories";

function compose(S: any, key: string) {
  const meta: any = S.default ?? {};
  const st: any = S[key];
  const args: any = { ...(meta.args ?? {}), ...(st && st.args ? st.args : {}) };
  // Storybook resolves argTypes.mapping (control value -> real arg) before
  // rendering; mirror that so mapped args don't render raw.
  const at: any = { ...(meta.argTypes ?? {}), ...(st && st.argTypes ? st.argTypes : {}) };
  for (const k of Object.keys(args)) {
    const m = at[k] && at[k].mapping;
    if (m && typeof m === 'object' && args[k] in m) args[k] = m[args[k]];
  }
  const title: string = typeof meta.title === 'string' ? meta.title : '';
  const ctx: any = {
    args, name: key, title, kind: title, id: '', componentId: '',
    globals: {}, viewMode: 'story',
    parameters: (st && st.parameters) ?? meta.parameters ?? {},
  };
  let render: (() => any) | null = null;
  if (st && typeof st.render === 'function') render = () => st.render(args, ctx);
  else if (typeof st === 'function') render = () => st(args, ctx);
  else if (typeof meta.render === 'function') render = () => meta.render(args, ctx);
  else {
    const C = (st && st.component) || meta.component;
    if (C) render = () => React.createElement(C, args);
  }
  if (!render) return () => null;
  // [].concat: a single function is legal CSF decorator shorthand. A
  // decorator returning undefined (stubbed addon) falls through to the inner
  // render — otherwise one unrecognized addon blanks the cell silently.
  const decorators: any[] = ([] as any[]).concat((st && st.decorators) ?? []).concat(meta.decorators ?? []);
  return decorators.reduce((inner: any, dec: any) => () => {
    const out = dec(inner, ctx);
    return out === undefined ? inner() : out;
  }, render);
}

const FRAME_HEIGHT = 880;

function inFrame(render: () => any) {
  return () =>
    React.createElement(
      'div',
      { style: { position: 'relative', height: FRAME_HEIGHT, width: '100%' } },
      render(),
    );
}

export const Add = inFrame(compose(S, "Add"));
export const Edit = inFrame(compose(S, "Edit"));
export const EditRecurring = inFrame(compose(S, "EditRecurring"));
export const NoCategories = inFrame(compose(S, "NoCategories"));
