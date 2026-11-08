import {createContext} from 'react';
import type {OrganizationItem} from './organization';
/** Navigation/import owners supplied by Dashboard; no parallel collection operation executor. */
export const CollectionCommandsContext=createContext<{activeCollectionId?:string;newNote:(item:OrganizationItem)=>Promise<void>;importFiles:(item:OrganizationItem)=>void}|null>(null);
