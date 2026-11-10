import {ReactNodeViewRenderer} from '@tiptap/react';
import ResourceLinkView from './ResourceLinkView';
import {ResourceLinkExtension as Definition} from './ResourceLinkDefinition';
export {resourceLinkPluginKey,activateResourceLinkSuggestion,type ResourceLinkState} from './ResourceLinkDefinition';
export const ResourceLinkExtension=Definition.extend({addNodeView(){return ReactNodeViewRenderer(ResourceLinkView);}});
