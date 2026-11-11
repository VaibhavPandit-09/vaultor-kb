import {useMemo} from 'react';
import HelpPresentation from './HelpPresentation';
import {articles,catalogue,helpArticle,helpLink,searchHelp} from '../../lib/help';
import {getShortcutCategories,isMac} from '../../lib/shortcuts';
import {useSettings} from '../../lib/settings';
import {getPlatform} from '../../lib/platform';
export default function HelpCenter({open,topic,onClose}:{open:boolean;topic:string;onClose:()=>void}){return open?<OriginalHelp topic={topic} onClose={onClose}/>:null;}
function OriginalHelp({topic,onClose}:{topic:string;onClose:()=>void}){const {resolvedShortcuts}=useSettings();const shortcuts=useMemo(()=>getShortcutCategories(resolvedShortcuts,Boolean(getPlatform().resourceClipboard)),[resolvedShortcuts]);return <HelpPresentation topic={topic} onClose={onClose} service={{articles,catalogue,helpArticle,helpLink,searchHelp,shortcuts,platform:window.vaultorDesktop?isMac?'macos':'windows':'browser',writeClipboard:text=>getPlatform().writeClipboard(text)}}/>;}
