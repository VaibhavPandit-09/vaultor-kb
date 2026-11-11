import {headingId} from '../lib/helpText';
import type {HelpTopic} from '../components/modals/HelpPresentation';
export function nextHelpTopics(content:string):HelpTopic[]{const parts=content.split(/^## /m);return [{id:'next-foundation',title:'Vaultor Next overview',area:'Getting started',content:parts[0]},...parts.slice(1).map(part=>{const end=part.indexOf('\n'),title=part.slice(0,end).trim();return {id:headingId(title),title,area:'Vaultor Next',content:'# '+part};})];}
