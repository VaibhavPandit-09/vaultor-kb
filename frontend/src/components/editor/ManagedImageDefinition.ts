import {Node,mergeAttributes} from '@tiptap/core';
export const ManagedImage = Node.create({
  name: 'image', group: 'block', atom: true, draggable: true,
  addAttributes() { return { resourceId: { default: null }, alt: { default: '' }, caption: { default: '' }, width: { default: 100 }, alignment: { default: 'center' } }; },
  // External HTML images are not imported or fetched implicitly.
  parseHTML() { return [{ tag: 'figure[data-vaultor-image]', getAttrs: element => ({ resourceId: element.getAttribute('data-vaultor-image') }) }]; },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes({ 'data-vaultor-image': HTMLAttributes.resourceId }, HTMLAttributes), ['figcaption', HTMLAttributes.caption || HTMLAttributes.alt || 'Image']]; },


});
